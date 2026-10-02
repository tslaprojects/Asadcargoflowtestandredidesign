import "server-only";
import { requirePermission, type Actor } from "@/lib/auth/actor";
import { geocodePoint } from "./geocoding";
import { computeLoadRoute } from "./load-route";

export type RoutePreviewStop = {
  country: string;
  city: string;
  street?: string | null;
  building?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Километраж и время в пути для мастера груза (до сохранения). Ничего не пишет в бизнес-данные. */
export async function previewRoute(actor: Actor, stops: RoutePreviewStop[]) {
  requirePermission(actor, "LOAD_CREATE", "Маршрут рассчитывается при создании груза.");
  const points = await Promise.all(
    stops.map(async (s) => {
      if (s.latitude != null && s.longitude != null) return { latitude: s.latitude, longitude: s.longitude };
      const p = await geocodePoint({ country: s.country, city: s.city, street: s.street, building: s.building });
      return { latitude: p?.latitude ?? null, longitude: p?.longitude ?? null };
    }),
  );
  const route = await computeLoadRoute(points);
  return {
    distanceKm: route?.routeDistanceKm ?? null,
    durationMin: route?.routeDurationMin ?? null,
    source: route?.routeSource ?? null,
    located: points.filter((p) => p.latitude != null).length,
    total: points.length,
  };
}
