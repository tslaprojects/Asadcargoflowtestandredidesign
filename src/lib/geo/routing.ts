/**
 * Маршрут груза: интерфейс провайдера маршрутизации, оценка без провайдера, упрощение линии.
 * Модуль без зависимостей от сервера — используется сервисами, сидами и скриптами.
 */
import { roadKm, type LatLng } from "./distance";

/** Профиль маршрута. Пока только грузовик (фура). */
export type RouteProfile = "truck";

/** Маршрут по дорогам: километраж, время в пути, линия [lng, lat][]. */
export type RouteResult = { distanceKm: number; durationMin: number; geometry: [number, number][] };

/**
 * Ответ провайдера: маршрут; «не найден» (например, сегмент через закрытую границу — имеет смысл
 * пробовать по сегментам); «ошибка» (нет ключа, сеть, лимит — повторять бессмысленно, сразу оценка).
 */
export type RouteOutcome = { kind: "ok"; route: RouteResult } | { kind: "not_found" } | { kind: "error" };

export interface RoutingProvider {
  readonly name: string;
  route(waypoints: LatLng[], profile: RouteProfile): Promise<RouteOutcome>;
}

/** Средняя скорость фуры с учётом остановок для оценки времени в пути, км/ч. */
export const ESTIMATE_SPEED_KMH = 60;
/** Предел точек в сохраняемой линии маршрута. */
export const MAX_ROUTE_POINTS = 500;

export type RouteSourceKind = "PROVIDER" | "ESTIMATE";

export type ComputedRoute = RouteResult & { source: RouteSourceKind; provider: string | null };

/** Оценка сегмента: по прямой × коэффициент извилистости, линия — прямая. */
export function estimateSegment(a: LatLng, b: LatLng): RouteResult {
  const distanceKm = roadKm(a, b);
  return {
    distanceKm,
    durationMin: Math.round((distanceKm / ESTIMATE_SPEED_KMH) * 60),
    geometry: [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ],
  };
}

/** Оценка всего маршрута по точкам (без сети). */
export function estimateRoute(points: LatLng[]): ComputedRoute | null {
  if (points.length < 2) return null;
  const parts = points.slice(1).map((b, i) => estimateSegment(points[i], b));
  return { ...joinSegments(parts), source: "ESTIMATE", provider: null };
}

/** Склейка сегментов в один маршрут (без дублирования общих точек). */
export function joinSegments(parts: RouteResult[]): RouteResult {
  const geometry: [number, number][] = [];
  for (const p of parts) {
    for (const c of p.geometry) {
      const last = geometry[geometry.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) geometry.push(c);
    }
  }
  return {
    distanceKm: parts.reduce((s, p) => s + p.distanceKm, 0),
    durationMin: parts.reduce((s, p) => s + p.durationMin, 0),
    geometry,
  };
}

/**
 * Маршрут через провайдера с откатом на оценку:
 * - весь маршрут одним запросом;
 * - «не найден» — по сегментам: не найденный сегмент оценивается, остальные — по дорогам;
 * - ошибка провайдера (нет ключа, сеть, лимит) — оценка всего маршрута без новых запросов.
 * Источник PROVIDER — только если все сегменты построены по дорогам.
 */
export async function computeRoute(points: LatLng[], provider: RoutingProvider | null): Promise<ComputedRoute | null> {
  if (points.length < 2) return null;
  if (!provider) return estimateRoute(points);
  const whole = await provider.route(points, "truck");
  if (whole.kind === "ok") return { ...simplify(whole.route), source: "PROVIDER", provider: provider.name };
  if (whole.kind === "error" || points.length === 2) return estimateRoute(points);

  const parts: RouteResult[] = [];
  let estimated = false;
  let failed = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = failed ? ({ kind: "error" } as const) : await provider.route([a, b], "truck");
    if (seg.kind === "ok") {
      parts.push(seg.route);
    } else {
      // После ошибки провайдера оставшиеся сегменты не запрашиваем
      if (seg.kind === "error") failed = true;
      estimated = true;
      parts.push(estimateSegment(a, b));
    }
  }
  return { ...simplify(joinSegments(parts)), source: estimated ? "ESTIMATE" : "PROVIDER", provider: provider.name };
}

function simplify(r: RouteResult): RouteResult {
  return { ...r, geometry: simplifyLine(r.geometry, MAX_ROUTE_POINTS) };
}

/**
 * Упрощение линии (Дуглас — Пекер) до не более чем maxPoints точек. Концы сохраняются.
 * Допуск подбирается: начинаем с ~10 м и удваиваем, пока точек больше предела.
 */
export function simplifyLine(coords: [number, number][], maxPoints = MAX_ROUTE_POINTS): [number, number][] {
  const rounded = coords.map(([x, y]) => [round5(x), round5(y)] as [number, number]);
  if (rounded.length <= maxPoints) return rounded;
  let eps = 0.0001;
  let out = rounded;
  for (let i = 0; i < 30 && out.length > maxPoints; i++) {
    out = douglasPeucker(rounded, eps);
    eps *= 2;
  }
  return out.length > maxPoints ? thinLine(out, maxPoints) : out;
}

/** Равномерное прореживание (для лёгких списков на карте операций). Концы сохраняются. */
export function thinLine(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints || maxPoints < 2) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => coords[Math.round(i * step)]);
}

function douglasPeucker(pts: [number, number][], eps: number): [number, number][] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > eps) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

function perpDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** Разбор сохранённой линии маршрута (Json из БД) с проверкой формы. */
export function parseRouteGeometry(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const out: [number, number][] = [];
  for (const c of value) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const [lng, lat] = c as unknown[];
    if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    out.push([lng, lat]);
  }
  return out;
}
