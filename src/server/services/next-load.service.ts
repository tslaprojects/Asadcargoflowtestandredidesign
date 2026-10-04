import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { MovementIntent } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { countryName } from "@/lib/geo/countries";
import { haversineKm, ROAD_FACTOR } from "@/lib/geo/distance";
import { geocoder, knownCityPoints, nearestKnownCity } from "@/lib/geo/geocoder";
import { DAILY_RANGE_KM, matchNextLoads, type MatchCandidate, type MatchSort, type NextLoadMatch } from "@/lib/next-load/matching";
import { isCarrierRole } from "@/lib/permissions";
import { TRIP_STATUSES } from "@/lib/state-machine/order-state-machine";
import { toPlain } from "@/lib/serialize";
import type { plannedMovementSchema } from "@/lib/validation/next-load";
import { CARRIER_OFFICE_ROLES, companyUserIds, notify } from "./notification.service";

/**
 * Next Load / Следующий рейс.
 * Перевозчик (или водитель после доставки) указывает, куда планирует двигаться; система подбирает грузы
 * рядом с текущей точкой или вдоль коридора движения. Подбор — lib/next-load/matching.ts (чистая функция),
 * здесь — доступ, определение текущей позиции, выборка кандидатов и хранение плана (PlannedMovement).
 */

type MovementInput = z.output<typeof plannedMovementSchema>;

const DAY = 24 * 60 * 60_000;
const DEFAULT_WINDOW_DAYS = 7;

type Scope = { companyId: string; driverUserId: string | null };

/** Кто работает с «Следующим рейсом»: офис перевозчика (вся компания) или водитель (только свой автомобиль). */
function scopeFor(actor: Actor, need: "NEXT_LOAD_VIEW" | "NEXT_LOAD_PLAN"): Scope {
  const m = actor.active;
  if (!m) throw errors.forbidden("Выберите компанию-перевозчика.");
  if (isCarrierRole(m.role)) {
    if (!actor.permissions.has(need)) throw errors.forbidden("Недостаточно прав.");
    return { companyId: m.companyId, driverUserId: null };
  }
  if (m.role === "DRIVER" && need === "NEXT_LOAD_PLAN" && actor.permissions.has("NEXT_LOAD_PLAN")) {
    return { companyId: m.companyId, driverUserId: actor.userId };
  }
  throw errors.forbidden("Раздел «Следующий рейс» доступен перевозчикам.");
}

// ─────────── Позиция транспорта ───────────

const orderForSituation = {
  id: true,
  publicNumber: true,
  currentStatus: true,
  deliveredAt: true,
  deliveryDate: true,
  statusChangedAt: true,
  driverId: true,
  load: {
    select: {
      stops: {
        orderBy: { sequence: "asc" as const },
        select: { sequence: true, type: true, city: true, country: true, latitude: true, longitude: true },
      },
    },
  },
} satisfies Prisma.TransportOrderSelect;

type SituationOrder = Prisma.TransportOrderGetPayload<{ select: typeof orderForSituation }>;

export type VehicleSituation = {
  phase: "IN_TRIP" | "DELIVERED" | "FREE";
  order: { id: string; publicNumber: string; status: string } | null;
  /** Где автомобиль будет свободен */
  freePoint: {
    lat: number;
    lng: number;
    label: string;
    city: string | null;
    country: string | null;
    source: "TRACKING" | "ORDER_DELIVERY";
  } | null;
  /** Последняя известная позиция (отметка водителя) */
  lastPosition: { lat: number; lng: number; at: Date } | null;
  /** Точка, откуда начинался текущий/последний рейс (для «Вернуться обратно») */
  returnPoint: { lat: number; lng: number; city: string; country: string } | null;
  remainingKm: number | null;
  freeFrom: Date;
};

async function situationForOrder(order: SituationOrder | null): Promise<VehicleSituation> {
  const now = new Date();
  if (!order)
    return { phase: "FREE", order: null, freePoint: null, lastPosition: null, returnPoint: null, remainingKm: null, freeFrom: now };
  const stops = order.load.stops;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const lastEvent = await prisma.trackingEvent.findFirst({
    where: { orderId: order.id, latitude: { not: null }, longitude: { not: null } },
    orderBy: { recordedAt: "desc" },
    select: { latitude: true, longitude: true, recordedAt: true },
  });
  const lastPosition = lastEvent ? { lat: lastEvent.latitude!, lng: lastEvent.longitude!, at: lastEvent.recordedAt } : null;
  const returnPoint =
    first?.latitude != null && first.longitude != null
      ? { lat: first.latitude, lng: first.longitude, city: first.city, country: first.country }
      : null;
  const deliveryPoint =
    last?.latitude != null && last.longitude != null
      ? {
          lat: last.latitude,
          lng: last.longitude,
          label: last.city,
          city: last.city,
          country: last.country,
          source: "ORDER_DELIVERY" as const,
        }
      : null;
  const inTrip = TRIP_STATUSES.includes(order.currentStatus);
  const base = { order: { id: order.id, publicNumber: order.publicNumber, status: order.currentStatus }, lastPosition, returnPoint };
  if (inTrip) {
    const remainingKm = deliveryPoint && lastPosition ? Math.round(haversineKm(lastPosition, deliveryPoint) * ROAD_FACTOR) : null;
    const freeFrom = remainingKm != null ? new Date(now.getTime() + (remainingKm / DAILY_RANGE_KM) * DAY) : (order.deliveryDate ?? now);
    return { phase: "IN_TRIP", ...base, freePoint: deliveryPoint, remainingKm, freeFrom };
  }
  // После доставки: свежая отметка водителя после выгрузки точнее адреса разгрузки
  const after = order.deliveredAt && lastPosition && lastPosition.at > order.deliveredAt;
  const near = after ? nearestKnownCity(lastPosition!.lat, lastPosition!.lng) : null;
  const freePoint = after
    ? {
        lat: lastPosition!.lat,
        lng: lastPosition!.lng,
        label: near && near.distanceKm < 50 ? near.city : "Текущая позиция",
        city: near && near.distanceKm < 50 ? near.city : null,
        country: near && near.distanceKm < 50 ? near.country : null,
        source: "TRACKING" as const,
      }
    : deliveryPoint;
  return {
    phase: order.currentStatus === "DELIVERED" ? "DELIVERED" : "FREE",
    ...base,
    freePoint,
    remainingKm: null,
    freeFrom: now,
  };
}

/** Текущий или последний рейс автомобиля. */
async function lastOrderForVehicle(vehicleId: string, companyId: string) {
  const active = await prisma.transportOrder.findFirst({
    where: { vehicleId, carrierCompanyId: companyId, currentStatus: { in: [...TRIP_STATUSES, "DELIVERED"] } },
    orderBy: { statusChangedAt: "desc" },
    select: orderForSituation,
  });
  if (active) return active;
  return prisma.transportOrder.findFirst({
    where: { vehicleId, carrierCompanyId: companyId, currentStatus: "CLOSED" },
    orderBy: { closedAt: "desc" },
    select: orderForSituation,
  });
}

// ─────────── Кандидаты ───────────

const candidateInclude = {
  stops: {
    orderBy: { sequence: "asc" as const },
    select: { sequence: true, type: true, country: true, city: true, latitude: true, longitude: true },
  },
  company: { select: { id: true, legalName: true, verificationStatus: true } },
} satisfies Prisma.LoadInclude;

async function candidateLoads(companyId: string, until: Date) {
  const now = new Date();
  const loads = await prisma.load.findMany({
    where: {
      status: { in: ["PUBLISHED", "BIDDING"] },
      deletedAt: null,
      company: { verificationStatus: { not: "SUSPENDED" }, deletedAt: null },
      loadingDateFrom: { lte: new Date(until.getTime() + DAY) },
      OR: [
        { loadingDateTo: { gte: new Date(now.getTime() - DAY) } },
        { loadingDateTo: null, loadingDateFrom: { gte: new Date(now.getTime() - 2 * DAY) } },
      ],
      AND: [
        {
          OR: [{ visibility: "MARKETPLACE" }, { visibility: "INVITE_ONLY", invitations: { some: { carrierCompanyId: companyId } } }],
        },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 500,
    include: {
      ...candidateInclude,
      bids: { where: { carrierCompanyId: companyId }, select: { status: true, amount: true, currency: true } },
      _count: { select: { bids: true } },
    },
  });
  return loads;
}

type CandidateLoad = Awaited<ReturnType<typeof candidateLoads>>[number];

function toCandidate(l: CandidateLoad): MatchCandidate {
  const first = l.stops[0];
  const last = l.stops[l.stops.length - 1];
  const pt = (s: typeof first | undefined) =>
    s && s.latitude != null && s.longitude != null ? { lat: s.latitude, lng: s.longitude, city: s.city, country: s.country } : null;
  return {
    id: l.id,
    pickup: pt(first),
    delivery: pt(last),
    weightKg: Number(l.weightKg),
    volumeM3: l.volumeM3 ? Number(l.volumeM3) : null,
    bodyType: l.bodyType,
    requiresGps: l.requiresGps,
    loadingDateFrom: l.loadingDateFrom,
    loadingDateTo: l.loadingDateTo,
    targetPrice: l.priceType === "REQUEST_QUOTE" || l.targetPrice == null ? null : Number(l.targetPrice),
    currency: l.currency,
  };
}

// ─────────── Точки ───────────

async function resolvePoint(p: {
  country?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
}) {
  if (p.latitude != null && p.longitude != null) {
    const near = nearestKnownCity(p.latitude, p.longitude);
    const nearLabel = near && near.distanceKm < 60 ? near.city : null;
    return {
      lat: p.latitude,
      lng: p.longitude,
      label: p.label || nearLabel || `${p.latitude.toFixed(2)}, ${p.longitude.toFixed(2)}`,
      city: p.city ?? nearLabel,
      country: p.country ?? (nearLabel ? near!.country : null),
    };
  }
  const point = await geocoder.geocodeCity(p.country!, p.city!);
  if (!point) {
    throw errors.validation(`Город «${p.city}» (${countryName(p.country)}) не найден в справочнике — выберите точку на карте.`, {
      destinations: ["Город не найден"],
    });
  }
  return { lat: point.latitude, lng: point.longitude, label: p.label || p.city!, city: p.city!, country: p.country! };
}

// ─────────── Команды ───────────

export async function createMovement(actor: Actor, input: MovementInput) {
  const scope = scopeFor(actor, "NEXT_LOAD_PLAN");
  let vehicleId = input.vehicleId ?? null;
  let sourceOrderId = input.sourceOrderId ?? null;
  let driverId: string | null = null;

  if (scope.driverUserId) {
    // Водитель: только свой текущий/последний рейс
    const order = await prisma.transportOrder.findFirst({
      where: {
        carrierCompanyId: scope.companyId,
        driver: { userId: scope.driverUserId },
        currentStatus: { in: [...TRIP_STATUSES, "DELIVERED", "CLOSED"] },
        ...(sourceOrderId ? { id: sourceOrderId } : {}),
      },
      orderBy: { statusChangedAt: "desc" },
      select: { id: true, vehicleId: true, driverId: true },
    });
    if (!order || !order.vehicleId) throw errors.forbidden("Планировать следующий рейс водитель может только для своего автомобиля.");
    if (vehicleId && vehicleId !== order.vehicleId) throw errors.forbidden("Это не ваш автомобиль.");
    vehicleId = order.vehicleId;
    sourceOrderId = order.id;
    driverId = order.driverId;
  }

  let vehicle = null;
  if (vehicleId) {
    vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, companyId: scope.companyId, deletedAt: null } });
    if (!vehicle) throw errors.notFound("Автомобиль не найден в вашем автопарке.");
  }
  let sourceOrder: SituationOrder | null = null;
  if (sourceOrderId) {
    sourceOrder = await prisma.transportOrder.findFirst({
      where: { id: sourceOrderId, carrierCompanyId: scope.companyId },
      select: orderForSituation,
    });
    if (!sourceOrder) throw errors.notFound("Перевозка не найдена.");
    driverId ??= sourceOrder.driverId;
  } else if (vehicleId) {
    sourceOrder = await lastOrderForVehicle(vehicleId, scope.companyId);
    if (sourceOrder) sourceOrderId = sourceOrder.id;
  }
  const situation = await situationForOrder(sourceOrder);

  // Текущая точка: явно указанная или определённая по рейсу
  let origin: { lat: number; lng: number; label: string; city: string | null; country: string | null; source: string };
  if (input.origin) origin = { ...(await resolvePoint(input.origin)), source: "MANUAL" };
  else if (situation.freePoint) origin = { ...situation.freePoint };
  else
    throw errors.validation("Не удалось определить текущую позицию — укажите город, где находится автомобиль.", {
      origin: ["Укажите город"],
    });

  const intent: MovementIntent = input.intent;
  let destinations: { lat: number; lng: number; label: string; city: string | null; country: string | null }[] = [];
  if (intent === "RETURN") {
    if (!situation.returnPoint) throw errors.validation("Не удалось определить точку возврата — выберите город назначения.");
    destinations = [
      {
        lat: situation.returnPoint.lat,
        lng: situation.returnPoint.lng,
        label: `${situation.returnPoint.city} (обратно)`,
        city: situation.returnPoint.city,
        country: situation.returnPoint.country,
      },
    ];
  } else if (intent !== "UNDECIDED") {
    destinations = await Promise.all(input.destinations.map(resolvePoint));
  }
  for (const d of destinations) {
    if (haversineKm(origin, d) < 20) {
      throw errors.validation(`Направление «${d.label}» совпадает с текущей точкой — выберите другое.`, {
        destinations: ["Совпадает с текущей точкой"],
      });
    }
  }

  const availableFrom = input.availableFrom ?? situation.freeFrom;
  const availableUntil = input.availableUntil ?? new Date(availableFrom.getTime() + DEFAULT_WINDOW_DAYS * DAY);
  if (availableUntil < availableFrom) throw errors.validation("Период доступности указан неверно.", { availableUntil: ["Раньше начала"] });

  const movement = await prisma.$transaction(async (tx) => {
    if (vehicleId) {
      await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId}::uuid FOR UPDATE`;
      await tx.plannedMovement.updateMany({ where: { vehicleId, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    }
    const created = await tx.plannedMovement.create({
      data: {
        companyId: scope.companyId,
        vehicleId,
        driverId,
        sourceOrderId,
        createdByUserId: actor.userId,
        intent,
        originLabel: origin.label,
        originCity: origin.city,
        originCountry: origin.country,
        originLat: origin.lat,
        originLng: origin.lng,
        originSource: origin.source,
        allowedDeviationKm: input.allowedDeviationKm,
        maxPickupDistanceKm: input.maxPickupDistanceKm,
        availableFrom,
        availableUntil,
        note: input.note,
        destinations: {
          create: destinations.map((d, i) => ({
            sequence: i + 1,
            label: d.label,
            city: d.city,
            country: d.country,
            latitude: d.lat,
            longitude: d.lng,
          })),
        },
      },
      include: { destinations: { orderBy: { sequence: "asc" } } },
    });
    await audit(
      actor,
      {
        action: AuditAction.PLANNED_MOVEMENT_CREATED,
        entityType: sourceOrderId ? "TransportOrder" : "PlannedMovement",
        entityId: sourceOrderId ?? created.id,
        newValue: {
          movementId: created.id,
          intent,
          vehicleId,
          origin: origin.label,
          destinations: destinations.map((d) => d.label),
          allowedDeviationKm: input.allowedDeviationKm,
        },
      },
      tx,
    );
    return created;
  });

  const result = await computeMatches(movement.id, scope.companyId, "efficiency");
  if (scope.driverUserId) {
    // Водитель сообщил планы — диспетчер видит подходящие грузы и принимает решение о ставке
    await prisma.$transaction(async (tx) => {
      await notify(tx, {
        userIds: await companyUserIds(tx, scope.companyId, CARRIER_OFFICE_ROLES),
        type: "NEXT_LOAD_SUGGESTIONS",
        title: `${actor.fullName}: ${destinations.length ? `планирует ехать в ${destinations.map((d) => d.label).join(", ")}` : "свободен после доставки"}`,
        body: `${vehicle ? `${vehicle.plateNumber} · ` : ""}${origin.label}. Подходящих грузов: ${result.matches.length}.`,
        entityType: "PlannedMovement",
        entityId: movement.id,
        link: `/next-load?movement=${movement.id}`,
      });
    });
  }
  return { movement: toPlain(movement), matchesCount: result.matches.length };
}

export async function cancelMovement(actor: Actor, movementId: string) {
  const scope = scopeFor(actor, "NEXT_LOAD_PLAN");
  const m = await prisma.plannedMovement.findFirst({ where: { id: movementId, companyId: scope.companyId } });
  if (!m) throw errors.notFound("План не найден.");
  if (scope.driverUserId && m.createdByUserId !== actor.userId) throw errors.forbidden();
  if (m.status !== "ACTIVE") throw new AppError("DUPLICATE_ACTION", "План уже неактивен.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.plannedMovement.update({ where: { id: movementId }, data: { status: "CANCELLED" } });
    await audit(
      actor,
      {
        action: AuditAction.PLANNED_MOVEMENT_CANCELLED,
        entityType: m.sourceOrderId ? "TransportOrder" : "PlannedMovement",
        entityId: m.sourceOrderId ?? m.id,
        oldValue: { movementId, status: m.status },
      },
      tx,
    );
    return updated;
  });
}

// ─────────── Подбор ───────────

async function computeMatches(movementId: string, companyId: string, sort: MatchSort, preloaded?: CandidateLoad[]) {
  const movement = await prisma.plannedMovement.findFirstOrThrow({
    where: { id: movementId, companyId },
    include: {
      destinations: { orderBy: { sequence: "asc" } },
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          make: true,
          model: true,
          bodyType: true,
          capacityKg: true,
          volumeM3: true,
          gpsEnabled: true,
        },
      },
    },
  });
  const loads = preloaded ?? (await candidateLoads(companyId, movement.availableUntil));
  const byId = new Map(loads.map((l) => [l.id, l]));
  const { matches, rejected } = matchNextLoads(
    {
      origin: { lat: movement.originLat, lng: movement.originLng, label: movement.originLabel },
      destinations: movement.destinations.map((d) => ({ lat: d.latitude, lng: d.longitude, label: d.label })),
      allowedDeviationKm: movement.allowedDeviationKm,
      maxPickupDistanceKm: movement.maxPickupDistanceKm,
      availableFrom: movement.availableFrom,
      availableUntil: movement.availableUntil,
      vehicle: movement.vehicle
        ? {
            bodyType: movement.vehicle.bodyType,
            capacityKg: Number(movement.vehicle.capacityKg),
            volumeM3: movement.vehicle.volumeM3 ? Number(movement.vehicle.volumeM3) : null,
            gpsEnabled: movement.vehicle.gpsEnabled,
          }
        : null,
    },
    loads.map(toCandidate),
    sort,
  );
  return { movement, matches, rejected, byId };
}

export type MatchWithLoad = NextLoadMatch & { load: ReturnType<typeof loadCard> };

function loadCard(l: CandidateLoad) {
  return {
    id: l.id,
    publicNumber: l.publicNumber,
    title: l.title,
    status: l.status,
    weightKg: Number(l.weightKg),
    volumeM3: l.volumeM3 ? Number(l.volumeM3) : null,
    bodyType: l.bodyType,
    priceType: l.priceType,
    targetPrice: l.targetPrice ? Number(l.targetPrice) : null,
    currency: l.currency,
    loadingDateFrom: l.loadingDateFrom,
    loadingDateTo: l.loadingDateTo,
    deliveryDateFrom: l.deliveryDateFrom,
    deliveryDateTo: l.deliveryDateTo,
    stops: l.stops,
    company: l.company,
    _count: l._count,
    bids: l.bids.map((b) => ({ ...b, amount: Number(b.amount) })),
  };
}

export async function getMovementMatches(actor: Actor, movementId: string, sort: MatchSort) {
  const scope = scopeFor(actor, scopeNeed(actor));
  const m = await prisma.plannedMovement.findFirst({ where: { id: movementId, companyId: scope.companyId } });
  if (!m) throw errors.notFound("План не найден.");
  if (scope.driverUserId && m.createdByUserId !== actor.userId) {
    // Водитель видит только планы своего автомобиля (где он указан водителем)
    const own = m.driverId
      ? await prisma.driverProfile.count({ where: { id: m.driverId, userId: actor.userId, companyId: scope.companyId } })
      : 0;
    if (!own) throw errors.forbidden();
  }
  const { movement, matches, rejected, byId } = await computeMatches(movementId, scope.companyId, sort);
  const hidePrices = Boolean(scope.driverUserId);
  return {
    movement: toPlain(movement),
    matches: matches.map((x) => {
      const card = loadCard(byId.get(x.loadId)!);
      return hidePrices
        ? { ...x, estimatedPrice: null, ratePerKm: null, load: { ...card, targetPrice: null, bids: [] } }
        : { ...x, load: card };
    }),
    rejected: rejected
      .slice(0, 30)
      .map((r) => ({ ...r, publicNumber: byId.get(r.loadId)?.publicNumber ?? "", title: byId.get(r.loadId)?.title ?? "" })),
    rejectedCount: rejected.length,
  };
}

function scopeNeed(actor: Actor): "NEXT_LOAD_VIEW" | "NEXT_LOAD_PLAN" {
  return actor.active?.role === "DRIVER" ? "NEXT_LOAD_PLAN" : "NEXT_LOAD_VIEW";
}

/** Состояние автопарка для раздела «Следующий рейс»: где будет свободна каждая машина и активные планы. */
export async function nextLoadContext(actor: Actor) {
  const scope = scopeFor(actor, "NEXT_LOAD_VIEW");
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: scope.companyId, deletedAt: null, status: { not: "INACTIVE" } },
    orderBy: { plateNumber: "asc" },
    select: {
      id: true,
      plateNumber: true,
      make: true,
      model: true,
      bodyType: true,
      capacityKg: true,
      volumeM3: true,
      gpsEnabled: true,
      status: true,
    },
  });
  const [movements, situations] = await Promise.all([
    prisma.plannedMovement.findMany({
      where: { companyId: scope.companyId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { destinations: { orderBy: { sequence: "asc" } } },
    }),
    Promise.all(vehicles.map(async (v) => situationForOrder(await lastOrderForVehicle(v.id, scope.companyId)))),
  ]);
  return {
    vehicles: vehicles.map((v, i) => ({
      ...toPlain(v),
      situation: toPlain(situations[i]),
      movement: toPlain(movements.find((m) => m.vehicleId === v.id) ?? null),
    })),
    movementsWithoutVehicle: toPlain(movements.filter((m) => !m.vehicleId)),
    cities: knownCityPoints(),
  };
}

/**
 * Превью для dashboard перевозчика: машины, которые скоро освободятся или уже свободны после доставки,
 * и количество подходящих грузов («Через 120 км вы будете в Алматы. Найдено 4 груза в направлении Москвы»).
 */
export async function nextLoadPreviews(actor: Actor) {
  const scope = scopeFor(actor, "NEXT_LOAD_VIEW");
  const orders = await prisma.transportOrder.findMany({
    where: {
      carrierCompanyId: scope.companyId,
      vehicleId: { not: null },
      OR: [
        { currentStatus: { in: ["LOADED", "IN_TRANSIT", "AT_BORDER", "CUSTOMS", "BORDER_CLEARED", "AT_DELIVERY", "DELIVERED"] } },
        { currentStatus: "CLOSED", closedAt: { gte: new Date(Date.now() - 3 * DAY) } },
      ],
    },
    orderBy: { statusChangedAt: "desc" },
    take: 10,
    select: {
      ...orderForSituation,
      vehicleId: true,
      vehicle: { select: { id: true, plateNumber: true, bodyType: true, capacityKg: true, volumeM3: true, gpsEnabled: true } },
    },
  });
  // Уникальные машины (последний рейс каждой) и все данные для подбора — пакетно, без запросов в цикле
  const latestByVehicle = new Map<string, (typeof orders)[number]>();
  for (const o of orders) if (o.vehicleId && !latestByVehicle.has(o.vehicleId)) latestByVehicle.set(o.vehicleId, o);
  const vehicleOrders = [...latestByVehicle.values()];
  const [situations, movements] = await Promise.all([
    Promise.all(vehicleOrders.map((o) => situationForOrder(o))),
    prisma.plannedMovement.findMany({
      where: { vehicleId: { in: [...latestByVehicle.keys()] }, status: "ACTIVE" },
      include: { destinations: { orderBy: { sequence: "asc" } } },
    }),
  ]);
  const until = new Date(
    Math.max(
      Date.now(),
      ...situations.map((x) => x.freeFrom.getTime() + DEFAULT_WINDOW_DAYS * DAY),
      ...movements.map((m) => m.availableUntil.getTime()),
    ),
  );
  const loads = vehicleOrders.length ? await candidateLoads(scope.companyId, until) : [];
  const candidates = loads.map(toCandidate);
  const previews = [];
  for (const [i, o] of vehicleOrders.entries()) {
    const situation = situations[i];
    if (!situation.freePoint) continue;
    const movement = movements.find((m) => m.vehicleId === o.vehicleId) ?? null;
    let count: number;
    if (movement) {
      count = (await computeMatches(movement.id, scope.companyId, "efficiency", loads)).matches.length;
    } else {
      const vehicleUntil = new Date(situation.freeFrom.getTime() + DEFAULT_WINDOW_DAYS * DAY);
      count = matchNextLoads(
        {
          origin: situation.freePoint,
          destinations: [],
          allowedDeviationKm: 250,
          maxPickupDistanceKm: 300,
          availableFrom: situation.freeFrom,
          availableUntil: vehicleUntil,
          vehicle: o.vehicle
            ? {
                bodyType: o.vehicle.bodyType,
                capacityKg: Number(o.vehicle.capacityKg),
                volumeM3: o.vehicle.volumeM3 ? Number(o.vehicle.volumeM3) : null,
                gpsEnabled: o.vehicle.gpsEnabled,
              }
            : null,
        },
        candidates,
      ).matches.length;
    }
    const directions = movement?.destinations.map((d) => d.label) ?? [];
    const where = situation.freePoint.label;
    const lead =
      situation.phase === "IN_TRIP"
        ? situation.remainingKm != null
          ? `Через ≈ ${situation.remainingKm} км вы будете в г. ${where}.`
          : `Рейс завершается в г. ${where}.`
        : `Автомобиль свободен в г. ${where}.`;
    previews.push({
      vehicleId: o.vehicleId,
      plateNumber: o.vehicle?.plateNumber ?? "",
      orderId: o.id,
      orderNumber: o.publicNumber,
      phase: situation.phase,
      remainingKm: situation.remainingKm,
      city: where,
      movementId: movement?.id ?? null,
      directions,
      matches: count,
      message: `${lead} Найдено ${count} ${plural(count, "подходящий груз", "подходящих груза", "подходящих грузов")}${
        directions.length ? ` в направлении ${directions.join(", ")}` : " рядом"
      }.`,
    });
  }
  return previews;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Для водителя: текущий план по его автомобилю. */
export async function driverMovement(actor: Actor) {
  const m = actor.active;
  if (!m || m.role !== "DRIVER") return null;
  const movement = await prisma.plannedMovement.findFirst({
    where: { companyId: m.companyId, status: "ACTIVE", OR: [{ createdByUserId: actor.userId }, { driver: { userId: actor.userId } }] },
    orderBy: { createdAt: "desc" },
    include: { destinations: { orderBy: { sequence: "asc" } } },
  });
  if (!movement) return null;
  const { matches } = await computeMatches(movement.id, m.companyId, "efficiency");
  return { movement: toPlain(movement), matchesCount: matches.length };
}
