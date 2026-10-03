import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { routeDistanceText } from "@/components/common/route-distance";
import { formatDistanceKm, formatDuration } from "@/lib/format";
import type { LatLng } from "@/lib/geo/distance";
import { GeoapifyGeocoder, GeoapifyRouting, parseGeoapifyGeocode, parseGeoapifyRoute } from "@/lib/geo/geoapify";
import { normalizeGeocodeQuery } from "@/lib/geo/geocoder";
import { navigatorLinks, navigatorWebLink } from "@/lib/geo/navigators";
import { stopsHash } from "@/lib/geo/route-hash";
import {
  computeRoute,
  estimateRoute,
  MAX_ROUTE_POINTS,
  parseRouteGeometry,
  simplifyLine,
  thinLine,
  type RouteOutcome,
  type RoutingProvider,
} from "@/lib/geo/routing";

const nbsp = (v: string) => v.replace(/\u00a0|\u202f/g, " ");
const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "../fixtures/geoapify", name), "utf8")) as unknown;
const ALMATY: LatLng = { lat: 43.2389, lng: 76.8897 };
const SHYMKENT: LatLng = { lat: 42.3417, lng: 69.5901 };
const TASHKENT: LatLng = { lat: 41.2995, lng: 69.2401 };
const URUMQI: LatLng = { lat: 43.8256, lng: 87.6168 };

/** Фейковый провайдер: ответы по ключу «откуда→куда», учёт вызовов. */
function fakeProvider(answer: (w: LatLng[]) => RouteOutcome): RoutingProvider & { calls: LatLng[][] } {
  const calls: LatLng[][] = [];
  return {
    name: "fake",
    calls,
    async route(w) {
      calls.push(w);
      return answer(w);
    },
  };
}
const road = (w: LatLng[], km: number): RouteOutcome => ({
  kind: "ok",
  route: {
    distanceKm: km,
    durationMin: km,
    geometry: [
      [w[0].lng, w[0].lat],
      [w[0].lng + 0.5, w[0].lat + 0.1],
      [w[w.length - 1].lng, w[w.length - 1].lat],
    ],
  },
});

describe("Geoapify: разбор ответов", () => {
  it("маршрут: метры → км, секунды → минуты, MultiLineString склеивается без дублей", () => {
    const r = parseGeoapifyRoute(fixture("routing-truck.json"))!;
    expect(r.distanceKm).toBe(812.3);
    expect(r.durationMin).toBe(692);
    expect(r.geometry).toHaveLength(6);
    expect(r.geometry[0]).toEqual([76.8897, 43.2389]);
    expect(r.geometry.at(-1)).toEqual([69.2401, 41.2995]);
  });

  it("реальный ответ Geoapify (Алматы → Ташкент, mode=truck, сокращённая геометрия): 943,2 км, 13 ч 9 мин", () => {
    const r = parseGeoapifyRoute(fixture("routing-truck-almaty-tashkent.json"))!;
    expect(r.distanceKm).toBe(943.2);
    expect(r.durationMin).toBe(789);
    // Порядок координат GeoJSON — [lng, lat]
    expect(r.geometry[0]).toEqual([76.889965, 43.239044]);
    expect(r.geometry.at(-1)).toEqual([69.239681, 41.298809]);
    expect(r.geometry).toHaveLength(14);
    expect(nbsp(formatDuration(r.durationMin))).toBe("13 ч 9 мин");
  });

  it("маршрут: пустой / битый ответ — null", () => {
    expect(parseGeoapifyRoute({ features: [] })).toBeNull();
    expect(parseGeoapifyRoute({ features: [{ properties: { distance: 0, time: 0 }, geometry: null }] })).toBeNull();
    expect(parseGeoapifyRoute(null)).toBeNull();
  });

  it("геокодинг города", () => {
    expect(parseGeoapifyGeocode(fixture("geocode-city.json"), "city")).toEqual({
      latitude: 42.9,
      longitude: 71.3666,
      accuracy: "city",
      confidence: 1,
    });
  });

  it("реальный ответ Geoapify (Тараз): населённый пункт, а не центр административной границы", () => {
    expect(parseGeoapifyGeocode(fixture("geocode-taraz-real.json"), "city")).toEqual({
      latitude: 42.8778381,
      longitude: 71.3519903,
      accuracy: "city",
      confidence: 1,
    });
  });

  it("геокодинг адреса: результат уровня города пропускается", () => {
    expect(parseGeoapifyGeocode(fixture("geocode-address.json"), "address")).toMatchObject({ latitude: 43.2402, accuracy: "address" });
  });

  it("низкая уверенность не принимается", () => {
    expect(parseGeoapifyGeocode({ results: [{ lat: 1, lon: 2, result_type: "city", rank: { confidence: 0.2 } }] }, "city")).toBeNull();
  });

  it("запрос маршрута: mode=truck, точки lat,lon через |; 400 — «не найден», сеть — «ошибка»", async () => {
    const urls: string[] = [];
    const ok = vi.fn(async (u: URL | RequestInfo) => {
      urls.push(String(u));
      return new Response(JSON.stringify(fixture("routing-truck.json")), { status: 200 });
    });
    const res = await new GeoapifyRouting("KEY", ok as unknown as typeof fetch).route([ALMATY, TASHKENT], "truck");
    expect(res.kind).toBe("ok");
    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe("https://api.geoapify.com/v1/routing");
    expect(url.searchParams.get("mode")).toBe("truck");
    expect(url.searchParams.get("waypoints")).toBe("43.238900,76.889700|41.299500,69.240100");

    const notFound = vi.fn(async () => new Response(JSON.stringify({ statusCode: 400, message: "Route not found" }), { status: 400 }));
    expect((await new GeoapifyRouting("KEY", notFound as unknown as typeof fetch).route([ALMATY, URUMQI], "truck")).kind).toBe("not_found");

    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await new GeoapifyRouting("KEY", offline as unknown as typeof fetch).route([ALMATY, URUMQI], "truck")).kind).toBe("error");

    const limit = vi.fn(async () => new Response("{}", { status: 429 }));
    expect((await new GeoapifyRouting("KEY", limit as unknown as typeof fetch).route([ALMATY, URUMQI], "truck")).kind).toBe("error");
  });

  it("запрос геокодинга: фильтр страны, адрес — улица и дом", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (u: URL | RequestInfo) => {
      urls.push(String(u));
      return new Response(JSON.stringify(fixture("geocode-address.json")), { status: 200 });
    });
    const r = await new GeoapifyGeocoder("KEY", f as unknown as typeof fetch).geocode({
      country: "KZ",
      city: "Алматы",
      street: "пр. Абая",
      building: "10",
    });
    expect(r).toMatchObject({ accuracy: "address" });
    const url = new URL(urls[0]);
    expect(url.searchParams.get("filter")).toBe("countrycode:kz");
    expect(url.searchParams.get("street")).toBe("пр. Абая");
    expect(url.searchParams.get("housenumber")).toBe("10");
    expect(url.searchParams.get("format")).toBe("json");
  });
});

describe("Маршрут: откат на оценку", () => {
  it("без провайдера — оценка по прямой × коэффициент", async () => {
    const r = (await computeRoute([ALMATY, TASHKENT], null))!;
    expect(r.source).toBe("ESTIMATE");
    expect(r.distanceKm).toBeCloseTo(estimateRoute([ALMATY, TASHKENT])!.distanceKm);
    expect(r.geometry).toHaveLength(2);
  });

  it("весь маршрут найден — PROVIDER, один запрос", async () => {
    const p = fakeProvider((w) => road(w, 800));
    const r = (await computeRoute([ALMATY, SHYMKENT, TASHKENT], p))!;
    expect(r).toMatchObject({ source: "PROVIDER", provider: "fake", distanceKm: 800 });
    expect(p.calls).toHaveLength(1);
  });

  it("ошибка провайдера — оценка всего маршрута без повторных запросов", async () => {
    const p = fakeProvider(() => ({ kind: "error" }));
    const r = (await computeRoute([URUMQI, ALMATY, TASHKENT], p))!;
    expect(r.source).toBe("ESTIMATE");
    expect(p.calls).toHaveLength(1);
  });

  it("маршрут не найден (граница с Китаем) — по сегментам: оценивается только упавший сегмент", async () => {
    const p = fakeProvider((w) => (w.length > 2 || w[0] === URUMQI ? { kind: "not_found" } : road(w, 700)));
    const r = (await computeRoute([URUMQI, ALMATY, TASHKENT], p))!;
    expect(p.calls).toHaveLength(3); // весь маршрут + 2 сегмента
    expect(r.source).toBe("ESTIMATE");
    const estimatedLeg = estimateRoute([URUMQI, ALMATY])!.distanceKm;
    expect(r.distanceKm).toBeCloseTo(estimatedLeg + 700);
    // Сегмент по дорогам сохранил свою линию (промежуточная точка), упавший — прямая
    expect(r.geometry.length).toBe(4);
  });

  it("меньше двух точек с координатами — маршрута нет", async () => {
    expect(await computeRoute([ALMATY], null)).toBeNull();
  });
});

describe("Линия маршрута", () => {
  it("упрощение до ≤ 500 точек, концы сохраняются", () => {
    const line: [number, number][] = Array.from({ length: 5000 }, (_, i) => [60 + i * 0.004, 45 + Math.sin(i / 40) * 0.5]);
    const s = simplifyLine(line);
    expect(s.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS);
    expect(s.length).toBeGreaterThan(20);
    expect(s[0]).toEqual([60, 45]);
    expect(s.at(-1)).toEqual([line.at(-1)![0], Math.round(line.at(-1)![1] * 1e5) / 1e5].map((v) => Math.round(v * 1e5) / 1e5));
  });

  it("прореживание для карты операций", () => {
    const line: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i, i]);
    const t = thinLine(line, 150);
    expect(t).toHaveLength(150);
    expect(t[0]).toEqual([0, 0]);
    expect(t.at(-1)).toEqual([999, 999]);
  });

  it("разбор сохранённой геометрии проверяет форму", () => {
    expect(
      parseRouteGeometry([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(
      parseRouteGeometry([
        [1, "2"],
        [3, 4],
      ]),
    ).toBeNull();
    expect(parseRouteGeometry(null)).toBeNull();
  });
});

describe("Хеш точек и ключ кэша", () => {
  it("хеш стабилен, зависит от координат и порядка, учитывает точки без координат", () => {
    const a = [
      { latitude: 43.2389, longitude: 76.8897 },
      { latitude: 41.2995, longitude: 69.2401 },
    ];
    expect(stopsHash(a)).toBe(stopsHash(a.map((p) => ({ ...p }))));
    expect(stopsHash(a)).not.toBe(stopsHash([...a].reverse()));
    expect(stopsHash(a)).not.toBe(stopsHash([a[0], { latitude: 41.3, longitude: 69.2401 }]));
    expect(stopsHash([a[0], { latitude: null, longitude: null }])).not.toBe(stopsHash([a[0]]));
    // Разница меньше ~1 м не считается изменением маршрута
    expect(stopsHash(a)).toBe(stopsHash([{ latitude: 43.238900001, longitude: 76.8897 }, a[1]]));
  });

  it("нормализация запроса геокодера", () => {
    expect(normalizeGeocodeQuery({ country: "KZ", city: "  Алматы " })).toBe("алматы");
    expect(normalizeGeocodeQuery({ country: "RU", city: "Королёв", street: "ул.  Ленина,", building: "5" })).toBe("королев|ул. ленина|5");
  });
});

describe("Навигаторы водителя", () => {
  const t = { lat: 43.238949, lng: 76.889709, city: "Алматы" };
  it("Яндекс: Навигатор → Карты → веб (lat,lon)", () => {
    expect(navigatorLinks("yandex", t)).toEqual([
      "yandexnavi://build_route_on_map?lat_to=43.238949&lon_to=76.889709",
      "yandexmaps://maps.yandex.ru/?rtext=~43.238949,76.889709&rtt=auto",
      "https://yandex.ru/maps/?rtext=~43.238949,76.889709&rtt=auto",
    ]);
  });
  it("2ГИС: порядок lon,lat", () => {
    expect(navigatorLinks("dgis", t)).toEqual([
      "dgis://2gis.ru/routeSearch/rsType/car/to/76.889709,43.238949",
      "https://2gis.ru/routeSearch/rsType/car/to/76.889709,43.238949",
    ]);
  });
  it("Google: веб; на iOS сначала приложение", () => {
    expect(navigatorWebLink("google", t)).toBe("https://www.google.com/maps/dir/?api=1&destination=43.238949,76.889709&travelmode=driving");
    expect(navigatorLinks("google", t, { ios: true })[0]).toBe("comgooglemaps://?daddr=43.238949,76.889709&directionsmode=driving");
  });
  it("без координат — адрес и город", () => {
    const a = { address: "пр. Абая, 10", city: "Алматы" };
    expect(decodeURIComponent(navigatorWebLink("yandex", a))).toBe("https://yandex.ru/maps/?rtext=~пр. Абая, 10, Алматы&rtt=auto");
    expect(navigatorWebLink("dgis", a)).toMatch(/^https:\/\/2gis\.ru\/search\//);
    expect(decodeURIComponent(navigatorWebLink("google", a))).toContain("destination=пр. Абая, 10, Алматы");
  });
});

describe("Форматирование километража", () => {
  const nb = (s: string | null) => s?.replace(/ | /g, " ");
  it("км и время в пути", () => {
    expect(nb(formatDistanceKm(1240.4))).toBe("1 240");
    expect(formatDistanceKm(null)).toBe("—");
    expect(formatDuration(45)).toBe("45 мин");
    expect(formatDuration(1110)).toBe("18 ч 30 мин");
    expect(formatDuration(3120)).toBe("2 д 4 ч");
  });
  it("оценка помечается", () => {
    expect(nb(routeDistanceText({ routeDistanceKm: 1240, routeDurationMin: 1200, routeSource: "ESTIMATE" }))).toBe("≈ 1 240 км (оценка)");
    expect(nb(routeDistanceText({ routeDistanceKm: 1240, routeDurationMin: 1200, routeSource: "PROVIDER" }))).toBe("1 240 км");
    expect(routeDistanceText({ routeDistanceKm: null, routeDurationMin: null, routeSource: null })).toBeNull();
  });
});
