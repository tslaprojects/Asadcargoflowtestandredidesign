import "server-only";
import { logger } from "@/lib/logger";
import type { LatLng } from "./distance";
import type { GeocodeAccuracy, GeocodeQuery, GeocodeResult } from "./geocoder";
import type { RouteOutcome, RouteProfile, RouteResult, RoutingProvider } from "./routing";

/**
 * Geoapify: маршруты для грузовика (Routing API, mode=truck) и геокодирование (Geocoding API с фильтром страны).
 * Ключ GEOAPIFY_API_KEY — только на сервере. Ошибки логируются и наружу не пробрасываются:
 * вызывающий код получает «ошибку» / null и переходит на оценку.
 */
const BASE = "https://api.geoapify.com/v1";
export const GEOAPIFY_TIMEOUT_MS = 8_000;
/** Минимальная уверенность геокодера, ниже которой точка не принимается. */
const MIN_CONFIDENCE = 0.5;

export function geoapifyKey(): string | null {
  const key = process.env.GEOAPIFY_API_KEY?.trim();
  return key ? key : null;
}

type Fetch = typeof fetch;

async function getJson(url: URL, fetchImpl: Fetch, what: string): Promise<{ status: number; body: unknown } | null> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(GEOAPIFY_TIMEOUT_MS), headers: { accept: "application/json" } });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch (e) {
    logger.warn("geoapify.request_failed", { what, error: e instanceof Error ? e.name : "unknown" });
    return null;
  }
}

/** Разбор ответа Routing API (GeoJSON FeatureCollection; distance — метры, time — секунды). */
export function parseGeoapifyRoute(body: unknown): RouteResult | null {
  const feature = (body as { features?: unknown[] } | null)?.features?.[0] as
    { properties?: { distance?: unknown; time?: unknown }; geometry?: { type?: unknown; coordinates?: unknown } } | undefined;
  if (!feature) return null;
  const distance = Number(feature.properties?.distance);
  const time = Number(feature.properties?.time);
  if (!Number.isFinite(distance) || !Number.isFinite(time) || distance <= 0) return null;
  const g = feature.geometry;
  let lines: unknown[] = [];
  if (g?.type === "MultiLineString" && Array.isArray(g.coordinates)) lines = g.coordinates;
  else if (g?.type === "LineString" && Array.isArray(g.coordinates)) lines = [g.coordinates];
  const geometry: [number, number][] = [];
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    for (const c of line) {
      if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
        const last = geometry[geometry.length - 1];
        if (!last || last[0] !== c[0] || last[1] !== c[1]) geometry.push([c[0], c[1]]);
      }
    }
  }
  if (geometry.length < 2) return null;
  return { distanceKm: Math.round(distance / 100) / 10, durationMin: Math.round(time / 60), geometry };
}

/** Разбор ответа Geocoding API (format=json): первый результат с достаточной уверенностью. */
export function parseGeoapifyGeocode(body: unknown, wanted: "address" | "city"): GeocodeResult | null {
  const results = (body as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return null;
  for (const r of results as { lat?: unknown; lon?: unknown; result_type?: unknown; rank?: { confidence?: unknown } }[]) {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const confidence = typeof r.rank?.confidence === "number" ? r.rank.confidence : null;
    if (confidence !== null && confidence < MIN_CONFIDENCE) continue;
    const type = String(r.result_type ?? "");
    let accuracy: GeocodeAccuracy;
    if (type === "building" || type === "amenity") accuracy = "address";
    else if (type === "street") accuracy = "street";
    else accuracy = "city";
    // Искали адрес, а нашёлся только город — это не адрес (город возьмём по отдельному запросу/кэшу)
    if (wanted === "address" && accuracy === "city") continue;
    return { latitude: lat, longitude: lon, accuracy, confidence };
  }
  return null;
}

export class GeoapifyRouting implements RoutingProvider {
  readonly name = "geoapify";
  constructor(
    private readonly key: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async route(waypoints: LatLng[], profile: RouteProfile): Promise<RouteOutcome> {
    const url = new URL(`${BASE}/routing`);
    url.searchParams.set("waypoints", waypoints.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("|"));
    url.searchParams.set("mode", profile);
    url.searchParams.set("apiKey", this.key);
    const res = await getJson(url, this.fetchImpl, "routing");
    if (!res) return { kind: "error" };
    if (res.status >= 200 && res.status < 300) {
      const route = parseGeoapifyRoute(res.body);
      if (route) return { kind: "ok", route };
      return { kind: "not_found" };
    }
    // 400/404 — маршрут невозможен (например, точки за закрытой границей); прочее — ключ, лимит, сбой
    if (res.status === 400 || res.status === 404) return { kind: "not_found" };
    logger.warn("geoapify.routing_status", { status: res.status });
    return { kind: "error" };
  }
}

export class GeoapifyGeocoder {
  readonly name = "geoapify";
  constructor(
    private readonly key: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  /** null — не найдено; "error" — провайдер недоступен (результат не кэшируется). */
  async geocode(q: GeocodeQuery): Promise<GeocodeResult | null | "error"> {
    const address = Boolean(q.street?.trim());
    const url = new URL(`${BASE}/geocode/search`);
    url.searchParams.set("city", q.city.trim());
    if (address) {
      url.searchParams.set("street", q.street!.trim());
      if (q.building?.trim()) url.searchParams.set("housenumber", q.building.trim());
    } else {
      url.searchParams.set("type", "city");
    }
    url.searchParams.set("filter", `countrycode:${q.country.trim().toLowerCase()}`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "3");
    url.searchParams.set("lang", "ru");
    url.searchParams.set("apiKey", this.key);
    const res = await getJson(url, this.fetchImpl, "geocode");
    if (!res) return "error";
    if (res.status < 200 || res.status >= 300) {
      logger.warn("geoapify.geocode_status", { status: res.status });
      return "error";
    }
    return parseGeoapifyGeocode(res.body, address ? "address" : "city");
  }
}
