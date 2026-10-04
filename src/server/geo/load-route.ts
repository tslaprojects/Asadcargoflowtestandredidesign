import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { stopsHash } from "@/lib/geo/route-hash";
import { computeRoute, estimateRoute, type ComputedRoute } from "@/lib/geo/routing";
import { logger } from "@/lib/logger";
import { geoProviders } from "./providers";

type StopPoint = { latitude: number | null; longitude: number | null };

/** Поля маршрута груза для записи в Load. */
export type LoadRouteFields = {
  routeDistanceKm: number | null;
  routeDurationMin: number | null;
  routeGeometry: Prisma.InputJsonValue | typeof Prisma.DbNull;
  routeSource: "PROVIDER" | "ESTIMATE" | null;
  routeProvider: string | null;
  routeComputedAt: Date;
  routeStopsHash: string;
};

function withCoords(stops: StopPoint[]) {
  return stops.filter((s) => s.latitude != null && s.longitude != null).map((s) => ({ lat: s.latitude!, lng: s.longitude! }));
}

export function routeFields(route: ComputedRoute | null, hash: string): LoadRouteFields {
  return {
    routeDistanceKm: route ? Math.round(route.distanceKm * 10) / 10 : null,
    routeDurationMin: route ? route.durationMin : null,
    routeGeometry: route ? route.geometry : Prisma.DbNull,
    routeSource: route?.source ?? null,
    routeProvider: route?.provider ?? null,
    routeComputedAt: new Date(),
    routeStopsHash: hash,
  };
}

/** Оценка без сети (сиды, тесты): по прямой × коэффициент. */
export function estimatedRouteFields(stops: StopPoint[]): LoadRouteFields {
  return routeFields(estimateRoute(withCoords(stops)), stopsHash(stops));
}

/**
 * Маршрут по точкам груза: провайдер маршрутизации с откатом на оценку.
 * previousHash совпадает с хешем точек — маршрут актуален, возвращается null (пересчёт не нужен).
 * Вызывать вне транзакций: внешний HTTP-запрос не должен держать блокировки строк.
 */
export async function computeLoadRoute(stops: StopPoint[], previousHash?: string | null): Promise<LoadRouteFields | null> {
  const hash = stopsHash(stops);
  if (previousHash && previousHash === hash) return null;
  const points = withCoords(stops);
  let route: ComputedRoute | null;
  try {
    route = await computeRoute(points, geoProviders().routing);
  } catch (e) {
    logger.warn("route.compute_failed", { error: e instanceof Error ? e.message : "unknown" });
    route = estimateRoute(points);
  }
  return routeFields(route, hash);
}

/** Текущий хеш маршрута груза (для решения, нужен ли пересчёт). */
export async function currentRouteHash(loadId: string): Promise<string | null> {
  const row = await prisma.load.findUnique({ where: { id: loadId }, select: { routeStopsHash: true } });
  return row?.routeStopsHash ?? null;
}
