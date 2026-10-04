import "server-only";
import type { OrderStatus, StopType } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { parseRouteGeometry, thinLine } from "@/lib/geo/routing";
import { orderHealth, tripProgress, type Health } from "@/lib/operations";
import { ACTIVE_STATUSES, ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";
import { ordersWhereForActiveCompany, ordersWhereForActor } from "./access";

/**
 * Живые объекты для карты и операционных списков: перевозка + маршрут + машина + водитель + последняя позиция.
 * Только чтение; доступ — те же фильтры, что у списков перевозок (ordersWhereFor*).
 */

export type GeoPoint = { lat: number; lng: number };
export type LiveStop = { type: StopType; city: string; country: string; point: GeoPoint | null };
export type LiveObject = {
  id: string;
  publicNumber: string;
  status: OrderStatus;
  statusLabel: string;
  health: Health;
  statusChangedAt: string;
  loadingDate: string | null;
  deliveryDate: string | null;
  title: string;
  weightKg: number | null;
  origin: string;
  destination: string;
  stops: LiveStop[];
  /** Линия маршрута по дорогам [lng, lat][] (прорежена для карты); null — соединять точки. */
  routeLine: [number, number][] | null;
  /** Километраж маршрута груза и его источник (PROVIDER — по дорогам, ESTIMATE — оценка). */
  distanceKm: number | null;
  distanceSource: "PROVIDER" | "ESTIMATE" | null;
  /** Последняя позиция: GPS/отметка водителя, иначе — оценка по маршруту и статусу. */
  position: (GeoPoint & { at: string | null; source: "tracking" | "estimated" }) | null;
  progress: number;
  vehicle: { id: string; plateNumber: string; make: string; model: string } | null;
  driver: { id: string; fullName: string; phone: string | null } | null;
  carrier: { id: string; legalName: string };
  shipper: { id: string; legalName: string };
};
export type OperationalEvent = {
  id: string;
  at: string;
  orderId: string;
  publicNumber: string;
  status: OrderStatus;
  title: string;
  comment: string | null;
};
export type OperationsIndicators = {
  active: number;
  moving: number;
  delayed: number;
  arriving: number;
  waiting: number;
  attention: number;
};

const liveSelect = {
  id: true,
  publicNumber: true,
  currentStatus: true,
  statusChangedAt: true,
  loadingDate: true,
  deliveryDate: true,
  load: {
    select: {
      title: true,
      weightKg: true,
      originCity: true,
      destinationCity: true,
      routeGeometry: true,
      routeSource: true,
      routeDistanceKm: true,
      stops: {
        orderBy: { sequence: "asc" as const },
        select: { type: true, city: true, country: true, latitude: true, longitude: true },
      },
    },
  },
  vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
  driver: { select: { id: true, fullName: true, phone: true } },
  carrier: { select: { id: true, legalName: true } },
  shipper: { select: { id: true, legalName: true } },
} as const;

type Row = Awaited<ReturnType<typeof fetchRows>>[number];

function fetchRows(where: object, take: number) {
  return prisma.transportOrder.findMany({ where, select: liveSelect, orderBy: { statusChangedAt: "desc" }, take });
}

const pt = (lat: number | null, lng: number | null): GeoPoint | null => (lat === null || lng === null ? null : { lat, lng });
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function estimate(stops: LiveStop[], status: OrderStatus): GeoPoint | null {
  const route = stops.filter((s) => s.point).map((s) => s.point!);
  if (route.length === 0) return null;
  const k = tripProgress(status);
  if (route.length === 1 || k <= 0) return route[0];
  if (k >= 1) return route[route.length - 1];
  // Положение по доле пути вдоль ломаной маршрута
  const seg = route.slice(1).map((p, i) => Math.hypot(p.lat - route[i].lat, p.lng - route[i].lng));
  let rest = seg.reduce((a, b) => a + b, 0) * k;
  for (let i = 0; i < seg.length; i++) {
    if (rest <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, rest / seg[i]) : 0;
      return { lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f, lng: route[i].lng + (route[i + 1].lng - route[i].lng) * f };
    }
    rest -= seg[i];
  }
  return route[route.length - 1];
}

async function toLiveObjects(rows: Row[], now = new Date()): Promise<LiveObject[]> {
  const ids = rows.map((r) => r.id);
  const fixes = ids.length
    ? await prisma.trackingEvent.findMany({
        where: { orderId: { in: ids }, latitude: { not: null }, longitude: { not: null } },
        orderBy: [{ orderId: "asc" }, { recordedAt: "desc" }],
        distinct: ["orderId"],
        select: { orderId: true, latitude: true, longitude: true, recordedAt: true },
      })
    : [];
  const fixBy = new Map(fixes.map((f) => [f.orderId, f]));
  return rows.map((r) => {
    const stops: LiveStop[] = r.load.stops.map((s) => ({
      type: s.type,
      city: s.city,
      country: s.country,
      point: pt(s.latitude, s.longitude),
    }));
    const fix = fixBy.get(r.id);
    const moving = !["CARRIER_SELECTED", "CONTRACT_PENDING", "CONTRACT_SIGNED", "CANCELLED"].includes(r.currentStatus);
    const est = moving ? estimate(stops, r.currentStatus) : null;
    const position = fix
      ? { lat: fix.latitude!, lng: fix.longitude!, at: fix.recordedAt.toISOString(), source: "tracking" as const }
      : est
        ? { ...est, at: null, source: "estimated" as const }
        : null;
    return {
      id: r.id,
      publicNumber: r.publicNumber,
      status: r.currentStatus,
      statusLabel: ORDER_STATUS_LABELS[r.currentStatus],
      health: orderHealth(r.currentStatus, { loadingDate: r.loadingDate, deliveryDate: r.deliveryDate }, now),
      statusChangedAt: r.statusChangedAt.toISOString(),
      loadingDate: iso(r.loadingDate),
      deliveryDate: iso(r.deliveryDate),
      title: r.load.title,
      weightKg: r.load.weightKg === null ? null : Number(r.load.weightKg),
      origin: r.load.originCity ?? stops[0]?.city ?? "—",
      destination: r.load.destinationCity ?? stops[stops.length - 1]?.city ?? "—",
      stops,
      // Оценка — это прямые между точками: их и так рисует карта
      routeLine: r.load.routeSource === "PROVIDER" ? thinRoute(r.load.routeGeometry) : null,
      distanceKm: r.load.routeDistanceKm,
      distanceSource: r.load.routeSource,
      position,
      progress: tripProgress(r.currentStatus),
      vehicle: r.vehicle,
      driver: r.driver,
      carrier: r.carrier,
      shipper: r.shipper,
    };
  });
}

/** Карта операций показывает много объектов: линия маршрута прореживается до 150 точек. */
const LIVE_ROUTE_POINTS = 150;
function thinRoute(geometry: unknown): [number, number][] | null {
  const line = parseRouteGeometry(geometry);
  return line ? thinLine(line, LIVE_ROUTE_POINTS) : null;
}

export function indicatorsFor(objects: LiveObject[]): OperationsIndicators {
  const n = (h: Health) => objects.filter((o) => o.health === h).length;
  return {
    active: objects.filter((o) => o.health !== "done" && o.health !== "cancelled").length,
    moving: n("moving") + n("arriving") + n("delayed"),
    delayed: n("delayed"),
    arriving: n("arriving"),
    waiting: n("waiting"),
    attention: n("attention") + objects.filter((o) => o.status === "DELIVERED").length,
  };
}

/** Операционная картина активной компании: живые объекты, индикаторы и поток событий. */
export async function liveOperations(actor: Actor) {
  const where = {
    AND: [ordersWhereForActiveCompany(actor), { currentStatus: { in: [...ACTIVE_STATUSES, "DISPUTED", "ON_HOLD"] as OrderStatus[] } }],
  };
  const rows = await fetchRows(where, 300);
  const [objects, history] = await Promise.all([
    toLiveObjects(rows),
    prisma.transportOrderStatusHistory.findMany({
      where: { order: ordersWhereForActiveCompany(actor) },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, createdAt: true, toStatus: true, comment: true, order: { select: { id: true, publicNumber: true } } },
    }),
  ]);
  const events: OperationalEvent[] = history.map((h) => ({
    id: h.id,
    at: h.createdAt.toISOString(),
    orderId: h.order.id,
    publicNumber: h.order.publicNumber,
    status: h.toStatus,
    title: ORDER_STATUS_LABELS[h.toStatus],
    comment: h.comment,
  }));
  return { objects, indicators: indicatorsFor(objects), events };
}

/** Живые объекты для заданных перевозок (карта рядом со списком) — только доступные пользователю. */
export async function liveObjectsForOrders(actor: Actor, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const rows = await fetchRows({ AND: [ordersWhereForActor(actor), { id: { in: orderIds } }] }, orderIds.length);
  return toLiveObjects(rows);
}

/** Текущие рейсы автопарка: машина → перевозка (для экрана «Автопарк»). */
export async function fleetAssignments(actor: Actor) {
  const companyId = actor.active?.companyId;
  if (!companyId) return [];
  const rows = await fetchRows({ carrierCompanyId: companyId, vehicleId: { not: null }, currentStatus: { in: ACTIVE_STATUSES } }, 300);
  return toLiveObjects(rows);
}

/**
 * Перевозчики как участники сети: свободные/занятые машины, водители и активные перевозки с вашей компанией.
 * Только агрегаты (без персональных данных чужих компаний).
 */
export async function carrierNetworkStats(actor: Actor, carrierIds: string[]) {
  if (carrierIds.length === 0) return {};
  const mine = actor.active?.companyId ?? null;
  const [vehicles, drivers, withMe] = await Promise.all([
    prisma.vehicle.groupBy({
      by: ["companyId", "status"],
      where: { companyId: { in: carrierIds }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.driverProfile.groupBy({
      by: ["companyId"],
      where: { companyId: { in: carrierIds }, deletedAt: null, status: "ACTIVE" },
      _count: { _all: true },
    }),
    mine
      ? prisma.transportOrder.findMany({
          where: {
            carrierCompanyId: { in: carrierIds },
            currentStatus: { in: ACTIVE_STATUSES },
            OR: [{ shipperCompanyId: mine }, { forwarderCompanyId: mine }],
          },
          select: {
            id: true,
            publicNumber: true,
            carrierCompanyId: true,
            currentStatus: true,
            load: { select: { originCity: true, destinationCity: true } },
          },
          orderBy: { statusChangedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const out: Record<
    string,
    {
      available: number;
      onTrip: number;
      vehicles: number;
      drivers: number;
      withMe: { id: string; publicNumber: string; route: string; status: OrderStatus }[];
    }
  > = {};
  for (const id of carrierIds) out[id] = { available: 0, onTrip: 0, vehicles: 0, drivers: 0, withMe: [] };
  for (const v of vehicles) {
    const o = out[v.companyId];
    o.vehicles += v._count._all;
    if (v.status === "AVAILABLE") o.available += v._count._all;
    if (v.status === "ASSIGNED") o.onTrip += v._count._all;
  }
  for (const d of drivers) out[d.companyId].drivers = d._count._all;
  for (const o of withMe)
    out[o.carrierCompanyId].withMe.push({
      id: o.id,
      publicNumber: o.publicNumber,
      route: `${o.load.originCity ?? "—"} → ${o.load.destinationCity ?? "—"}`,
      status: o.currentStatus,
    });
  return out;
}
