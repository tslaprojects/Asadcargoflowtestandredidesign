import { parseRouteGeometry } from "@/lib/geo/routing";
import type { MapLine, MapPoint } from "./map-view";

/**
 * Линия маршрута груза для карты: сохранённая геометрия по дорогам (сплошная).
 * Нет геометрии или это оценка (прямые между точками) — undefined: карта соединит точки пунктиром, как раньше.
 */
export function routeLines(route: { routeGeometry?: unknown; routeSource?: string | null }, color = "#007aff"): MapLine[] | undefined {
  const coords = parseRouteGeometry(route.routeGeometry);
  if (!coords) return undefined;
  const estimate = route.routeSource !== "PROVIDER";
  return [{ coordinates: coords, color, width: estimate ? 3 : 4, opacity: estimate ? 0.7 : 0.85, dashed: estimate }];
}

/** Точки маршрута груза с координатами — маркеры карты. */
export function stopPoints(stops: { type: string; city: string; latitude: number | null; longitude: number | null }[]): MapPoint[] {
  return stops
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      lat: s.latitude!,
      lng: s.longitude!,
      label: s.city,
      kind: (["PICKUP", "BORDER", "DELIVERY"].includes(s.type) ? s.type : "TRANSIT") as MapPoint["kind"],
    }));
}
