/**
 * Геометрия на сфере (без внешних сервисов). Расстояния — по дуге большого круга.
 * Для оценки дорожного пробега используется коэффициент извилистости ROAD_FACTOR.
 * При подключении маршрутизатора (OSRM, GraphHopper, 2GIS и т.п.) эти функции заменяются реальными маршрутами.
 */
export type LatLng = { lat: number; lng: number };

export const EARTH_RADIUS_KM = 6371;
/** Средний коэффициент «дорога / прямая» для магистралей Китай — Центральная Азия — Россия (оценка). */
export const ROAD_FACTOR = 1.2;

const rad = (d: number) => (d * Math.PI) / 180;

/** Расстояние по прямой (дуга большого круга), км. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Оценка дорожного расстояния, км. */
export function roadKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * ROAD_FACTOR;
}

/** Начальный азимут a → b, радианы. */
function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return Math.atan2(y, x);
}

export type SegmentProjection = {
  /** Расстояние от точки до отрезка (коридора), км */
  distanceKm: number;
  /** Положение проекции точки вдоль отрезка от начала, км (может быть < 0 или > длины) */
  alongKm: number;
  /** Длина отрезка, км */
  lengthKm: number;
};

/** Проекция точки p на отрезок a → b по большому кругу (cross-track / along-track). */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): SegmentProjection {
  const lengthKm = haversineKm(a, b);
  const d13 = haversineKm(a, p);
  if (lengthKm < 1e-6) return { distanceKm: d13, alongKm: 0, lengthKm };
  const delta13 = d13 / EARTH_RADIUS_KM;
  const theta = bearing(a, p) - bearing(a, b);
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(delta13) * Math.sin(theta))));
  const cosXt = Math.cos(xt);
  const at = cosXt === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, Math.cos(delta13) / cosXt)));
  const alongKm = (Math.cos(theta) >= 0 ? 1 : -1) * at * EARTH_RADIUS_KM;
  let distanceKm: number;
  if (alongKm < 0) distanceKm = d13;
  else if (alongKm > lengthKm) distanceKm = haversineKm(b, p);
  else distanceKm = Math.abs(xt * EARTH_RADIUS_KM);
  return { distanceKm, alongKm, lengthKm };
}
