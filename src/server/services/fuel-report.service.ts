import "server-only";
import type { z } from "zod";
import type { Currency } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import { computeConsumption, normDeviationPct, type Consumption } from "@/lib/fuel/consumption";
import { checkFuelPurchase, periodStarts, remainingLiters } from "@/lib/fuel/limits";
import { FUEL_TX_COUNTED, FUEL_TX_FUELED } from "@/lib/fuel/transaction-state-machine";
import { haversineKm, ROAD_FACTOR } from "@/lib/geo/distance";
import { nearestKnownCity } from "@/lib/geo/geocoder";
import { fromMinor, toMinor } from "@/lib/money";
import { TRIP_STATUSES } from "@/lib/state-machine/order-state-machine";
import type { fuelListQuerySchema } from "@/lib/validation/fuel";
import { requireOrderAccess } from "./access";
import { driverProfileFor, fuelScope, requireFleetVehicle } from "./fuel-access";
import { telemetryPoints } from "./fuel-analysis.service";
import { cardLimits } from "./fuel-card.service";
import { fuelTxInclude, fuelTxWhere } from "./fuel-transaction.service";
import { vehicleTelemetryState, type VehicleTelemetryState } from "./telemetry.service";

const DAY = 24 * 3_600_000;
const n = (d: unknown) => (d == null ? null : Number(d));

function placeLabel(lat: number, lng: number) {
  const c = nearestKnownCity(lat, lng);
  return c && c.distanceKm < 60 ? c.city : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

/** Статус автомобиля по топливу: открытые несоответствия и отклонение расхода от нормы. */
export function fuelHealth(openAnomalies: number, deviationPct: number | null): "OK" | "ATTENTION" | "CHECK" {
  if (openAnomalies > 0) return "CHECK";
  if (deviationPct != null && deviationPct > 10) return "ATTENTION";
  return "OK";
}

async function vehicleConsumption(vehicleId: string, from: Date, to: Date): Promise<Consumption> {
  const [points, purchases] = await Promise.all([
    telemetryPoints(vehicleId, from, to),
    prisma.fuelTransaction.findMany({
      where: { vehicleId, status: { in: FUEL_TX_FUELED }, transactionDate: { gte: from, lte: to } },
      select: { transactionDate: true, liters: true },
    }),
  ]);
  return computeConsumption({
    telemetry: points,
    purchases: purchases.map((p) => ({ at: p.transactionDate, liters: Number(p.liters) })),
    from,
    to,
  });
}

function locationOf(state: VehicleTelemetryState) {
  return state.location.status === "AVAILABLE"
    ? {
        lat: state.location.value.latitude,
        lng: state.location.value.longitude,
        label: placeLabel(state.location.value.latitude, state.location.value.longitude),
        at: state.location.recordedAt,
        source: state.location.source,
      }
    : null;
}

// ─────────── Автопарк ───────────

export async function fleetOverview(actor: Actor) {
  const scope = fuelScope(actor, "FUEL_VIEW");
  const to = new Date();
  const from = new Date(to.getTime() - 30 * DAY);
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: scope.companyId, deletedAt: null },
    orderBy: { plateNumber: "asc" },
    include: {
      orders: {
        where: { currentStatus: { in: TRIP_STATUSES } },
        take: 1,
        orderBy: { statusChangedAt: "desc" },
        select: {
          id: true,
          publicNumber: true,
          currentStatus: true,
          driver: { select: { id: true, fullName: true } },
          load: { select: { stops: { orderBy: { sequence: "asc" }, select: { city: true, country: true } } } },
        },
      },
      fuelCards: {
        where: { status: "ACTIVE" },
        select: { id: true, label: true, driver: { select: { id: true, fullName: true } } },
        take: 1,
      },
      _count: { select: { fuelAnomalies: { where: { status: { in: ["OPEN", "CONFIRMED", "INVESTIGATING"] } } } } },
    },
  });
  return Promise.all(
    vehicles.map(async (v) => {
      const [state, consumption, lastRefuel] = await Promise.all([
        vehicleTelemetryState(v.id),
        vehicleConsumption(v.id, from, to),
        prisma.fuelTransaction.findFirst({
          where: { vehicleId: v.id, status: { in: FUEL_TX_FUELED } },
          orderBy: { transactionDate: "desc" },
          select: { id: true, liters: true, stationName: true, transactionDate: true, matchStatus: true },
        }),
      ]);
      const trip = v.orders[0] ?? null;
      const norm = n(v.fuelNormPer100Km);
      const deviation = normDeviationPct(consumption.per100Km, norm);
      const stops = trip?.load.stops ?? [];
      return {
        id: v.id,
        plateNumber: v.plateNumber,
        make: v.make,
        model: v.model,
        vin: v.vin,
        vehicleType: v.vehicleType,
        engineType: v.engineType,
        fuelType: v.fuelType,
        status: v.status,
        tankCapacityLiters: n(v.tankCapacityLiters),
        fuelNormPer100Km: norm,
        telematicsConnected: Boolean(v.telematicsDeviceId),
        driver: trip?.driver ?? v.fuelCards[0]?.driver ?? null,
        trip: trip
          ? {
              id: trip.id,
              publicNumber: trip.publicNumber,
              status: trip.currentStatus,
              route: stops.length ? `${stops[0].city} → ${stops[stops.length - 1].city}` : "",
            }
          : null,
        location: locationOf(state),
        fuelLevel:
          state.fuelLevel.status === "AVAILABLE"
            ? { liters: state.fuelLevel.value.liters, source: state.fuelLevel.value.source, at: state.fuelLevel.recordedAt }
            : null,
        consumption,
        deviationPct: deviation,
        lastRefuel: lastRefuel ? { ...lastRefuel, liters: Number(lastRefuel.liters) } : null,
        openAnomalies: v._count.fuelAnomalies,
        health: fuelHealth(v._count.fuelAnomalies, deviation),
        demo: state.demo,
        card: v.fuelCards[0] ? { id: v.fuelCards[0].id, label: v.fuelCards[0].label } : null,
      };
    }),
  );
}

export type FleetVehicle = Awaited<ReturnType<typeof fleetOverview>>[number];

// ─────────── Дашборд «Топливо» ───────────

export async function fuelDashboard(actor: Actor, q: z.output<typeof fuelListQuerySchema>) {
  const scope = fuelScope(actor, "FUEL_VIEW");
  const to = q.to ? new Date(`${q.to}T23:59:59+05:00`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00+05:00`) : new Date(to.getTime() - 30 * DAY);
  const where = {
    ...fuelTxWhere(scope.companyId, { ...q, from: undefined, to: undefined, status: undefined }),
    transactionDate: { gte: from, lte: to },
  };
  const fueled = { ...where, status: q.status ? q.status : { in: FUEL_TX_FUELED } };
  const [byCurrency, totals, anomalies, fleet, recent] = await Promise.all([
    prisma.fuelTransaction.groupBy({ by: ["currency"], where: fueled, _sum: { totalAmount: true } }),
    prisma.fuelTransaction.aggregate({ where: fueled, _sum: { liters: true }, _count: true }),
    prisma.fuelAnomaly.count({
      where: {
        companyId: scope.companyId,
        detectedAt: { gte: from, lte: to },
        status: { in: ["OPEN", "CONFIRMED", "INVESTIGATING"] },
        ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
        ...(q.driverId ? { driverId: q.driverId } : {}),
      },
    }),
    fleetOverview(actor),
    prisma.fuelTransaction.findMany({
      where: { ...where, latitude: { not: null }, longitude: { not: null } },
      orderBy: { transactionDate: "desc" },
      take: 30,
      select: {
        id: true,
        stationName: true,
        latitude: true,
        longitude: true,
        liters: true,
        matchStatus: true,
        transactionDate: true,
        vehicle: { select: { plateNumber: true } },
      },
    }),
  ]);
  // Пробег и расход — только по автомобилям, где есть данные телематики за период
  const vehicles = q.vehicleId ? fleet.filter((v) => v.id === q.vehicleId) : fleet;
  const perVehicle = await Promise.all(vehicles.map((v) => vehicleConsumption(v.id, from, to)));
  const withData = perVehicle.filter((c) => c.distanceSource === "ODOMETER" && c.fuelUsedL != null && c.distanceKm && c.distanceKm > 1);
  const distance = withData.reduce((a, c) => a + c.distanceKm!, 0);
  const used = withData.reduce((a, c) => a + c.fuelUsedL!, 0);
  const money = actor.permissions.has("FUEL_FINANCE_VIEW");
  const spend = byCurrency.map((c) => ({ currency: c.currency as Currency, amount: Number(c._sum.totalAmount ?? 0) }));
  return {
    period: { from, to },
    kpi: {
      spend: money ? spend : null,
      liters: Math.round(Number(totals._sum.liters ?? 0) * 10) / 10,
      refuels: totals._count,
      anomalies,
      avgPer100Km: distance > 0 ? Math.round((used / distance) * 1000) / 10 : null,
      distanceKm: distance > 0 ? Math.round(distance) : null,
      costPerKm:
        money && distance > 0
          ? spend.map((s) => ({ currency: s.currency, amount: fromMinor(Math.round(toMinor(s.amount) / distance)) }))
          : null,
    },
    fleet,
    mapRefuels: recent.map((r) => ({ ...r, liters: Number(r.liters) })),
    overNorm: fleet
      .filter((v) => v.deviationPct != null && v.deviationPct > 0)
      .sort((a, b) => (b.deviationPct ?? 0) - (a.deviationPct ?? 0)),
  };
}

// ─────────── Автомобиль ───────────

export async function vehicleFuelReport(actor: Actor, vehicleId: string) {
  const scope = fuelScope(actor, "FUEL_VIEW");
  const v = await requireFleetVehicle(scope.companyId, vehicleId);
  const to = new Date();
  const from = new Date(to.getTime() - 30 * DAY);
  const money = actor.permissions.has("FUEL_FINANCE_VIEW");
  const [state, consumption, transactions, anomalies, cards, track, fleet] = await Promise.all([
    vehicleTelemetryState(v.id),
    vehicleConsumption(v.id, from, to),
    prisma.fuelTransaction.findMany({ where: { vehicleId: v.id }, orderBy: { transactionDate: "desc" }, take: 30, include: fuelTxInclude }),
    prisma.fuelAnomaly.findMany({ where: { vehicleId: v.id }, orderBy: [{ status: "asc" }, { detectedAt: "desc" }], take: 30 }),
    prisma.fuelCard.findMany({
      where: { vehicleId: v.id },
      select: { id: true, label: true, status: true, driver: { select: { fullName: true } } },
    }),
    telemetryPoints(v.id, new Date(to.getTime() - 3 * DAY), to),
    fleetOverview(actor),
  ]);
  const norm = n(v.fuelNormPer100Km);
  const summary = fleet.find((x) => x.id === v.id)!;
  return {
    vehicle: {
      ...v,
      tankCapacityLiters: n(v.tankCapacityLiters),
      fuelNormPer100Km: norm,
      capacityKg: Number(v.capacityKg),
      volumeM3: n(v.volumeM3),
    },
    summary,
    state,
    consumption,
    deviationPct: normDeviationPct(consumption.per100Km, norm),
    transactions: transactions.map((t) => (money ? t : { ...t, totalAmount: null, pricePerLiter: null, authorizedAmount: null })),
    anomalies,
    cards,
    levelSeries: track
      .filter((p) => p.fuelLevelLiters != null)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      .map((p) => ({ at: p.recordedAt, liters: p.fuelLevelLiters!, source: p.fuelLevelSource })),
    track: track
      .filter((p) => p.latitude != null)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      .map((p) => ({ lat: p.latitude!, lng: p.longitude!, at: p.recordedAt })),
  };
}

// ─────────── Отчёт по рейсу ───────────

export async function tripFuelReport(actor: Actor, orderId: string) {
  const { access, order } = await requireOrderAccess(actor, orderId);
  if (access.side !== "CARRIER" && access.side !== "ADMIN") throw errors.forbidden("Отчёт по топливу доступен перевозчику.");
  if (!access.can("FUEL_VIEW")) throw errors.forbidden("Недостаточно прав для просмотра топлива.");
  const full = await prisma.transportOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      load: { select: { stops: { orderBy: { sequence: "asc" }, select: { city: true, latitude: true, longitude: true } } } },
      vehicle: { select: { id: true, plateNumber: true, make: true, model: true, fuelNormPer100Km: true } },
      statusHistory: { where: { toStatus: "WAITING_FOR_LOADING" }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  const [txs, anomalies] = await Promise.all([
    prisma.fuelTransaction.findMany({ where: { orderId }, orderBy: { transactionDate: "asc" }, include: fuelTxInclude }),
    prisma.fuelAnomaly.count({ where: { orderId, status: { notIn: ["DISMISSED"] } } }),
  ]);
  const fueled = txs.filter((t) => FUEL_TX_FUELED.includes(t.status));
  const stops = full.load.stops.filter((s) => s.latitude != null && s.longitude != null);
  let routeKm = 0;
  for (let i = 1; i < stops.length; i++)
    routeKm +=
      haversineKm({ lat: stops[i - 1].latitude!, lng: stops[i - 1].longitude! }, { lat: stops[i].latitude!, lng: stops[i].longitude! }) *
      ROAD_FACTOR;
  const start = full.statusHistory[0]?.createdAt ?? fueled[0]?.transactionDate ?? null;
  const end = full.deliveredAt ?? new Date();
  const consumption = start
    ? computeConsumption({
        telemetry: full.vehicle ? await telemetryPoints(full.vehicle.id, start, end) : [],
        purchases: fueled.map((t) => ({ at: t.transactionDate, liters: Number(t.liters) })),
        from: start,
        to: end,
        routeEstimateKm: routeKm || null,
      })
    : null;
  const norm = n(full.vehicle?.fuelNormPer100Km);
  const spend = new Map<string, number>();
  for (const t of fueled) spend.set(t.currency, (spend.get(t.currency) ?? 0) + toMinor(Number(t.totalAmount)));
  return {
    orderNumber: order.publicNumber,
    route: full.load.stops.map((s) => s.city).join(" → "),
    vehicle: full.vehicle,
    finished: Boolean(full.deliveredAt),
    liters: Math.round(fueled.reduce((a, t) => a + Number(t.liters), 0) * 10) / 10,
    cost: [...spend.entries()].map(([currency, minor]) => ({ currency: currency as Currency, amount: fromMinor(minor) })),
    refuels: fueled.length,
    anomalies,
    consumption,
    norm,
    deviationPct: normDeviationPct(consumption?.per100Km ?? null, norm),
    routeEstimateKm: routeKm ? Math.round(routeKm) : null,
    transactions: txs,
  };
}

// ─────────── Водитель ───────────

/** Экран водителя: своя машина, своя карта, свои заправки. Баланс и расходы компании не передаются. */
export async function driverFuelView(actor: Actor) {
  const profile = await driverProfileFor(actor);
  const cards = await prisma.fuelCard.findMany({
    where: { driverId: profile.id, status: { notIn: ["CANCELLED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      account: { select: { balance: true, reserved: true } },
      vehicle: { select: { id: true, plateNumber: true, make: true, model: true, tankCapacityLiters: true } },
    },
  });
  const card = cards.find((c) => c.status === "ACTIVE") ?? cards[0] ?? null;
  const trip = await prisma.transportOrder.findFirst({
    where: { driverId: profile.id, currentStatus: { in: [...TRIP_STATUSES, "DELIVERED"] } },
    orderBy: { statusChangedAt: "desc" },
    select: {
      id: true,
      publicNumber: true,
      vehicle: { select: { id: true, plateNumber: true, make: true, model: true, tankCapacityLiters: true } },
    },
  });
  const vehicle = card?.vehicle ?? trip?.vehicle ?? null;
  let payment: { allowed: boolean; message: string } = {
    allowed: false,
    message: "Топливная карта не назначена. Обратитесь к диспетчеру.",
  };
  let remaining = null;
  if (card) {
    const now = new Date();
    const { dayStart, monthStart } = periodStarts(now, card.timezone);
    const [day, month] = await Promise.all([
      prisma.fuelTransaction.aggregate({
        where: { fuelCardId: card.id, status: { in: FUEL_TX_COUNTED }, transactionDate: { gte: dayStart } },
        _sum: { liters: true, totalAmount: true },
      }),
      prisma.fuelTransaction.aggregate({
        where: { fuelCardId: card.id, status: { in: FUEL_TX_COUNTED }, transactionDate: { gte: monthStart } },
        _sum: { liters: true, totalAmount: true },
      }),
    ]);
    const usage = {
      dayLiters: Number(day._sum.liters ?? 0),
      monthLiters: Number(month._sum.liters ?? 0),
      dayAmount: Number(day._sum.totalAmount ?? 0),
      monthAmount: Number(month._sum.totalAmount ?? 0),
    };
    const limits = cardLimits(card);
    remaining = remainingLiters(limits, usage);
    const available = fromMinor(toMinor(Number(card.account.balance)) - toMinor(Number(card.account.reserved)));
    // Проверка «можно ли сейчас заправиться» на минимальный объём — без раскрытия сумм
    const check = checkFuelPurchase(
      { status: card.status, expiresAt: card.expiresAt },
      {
        ...limits,
        perTransactionLiters: null,
        dailyLiters: null,
        monthlyLiters: null,
        dailyAmount: null,
        monthlyAmount: null,
        allowedStationBrands: [],
        allowedStationIds: [],
        allowedRegions: [],
        allowedFuelTypes: [],
      },
      { liters: 1, amount: 0.01, fuelType: "DIESEL", at: now },
      usage,
      { available },
    );
    const noLiters = remaining.nowMax != null && remaining.nowMax <= 0;
    payment =
      check.allowed && !noLiters
        ? { allowed: true, message: "Оплата разрешена" }
        : { allowed: false, message: noLiters ? "Лимит на сегодня исчерпан. Обратитесь к диспетчеру." : check.violations[0].driverMessage };
  }
  const showLevel = card?.driverCanSeeFuelLevel ?? false;
  const state = vehicle && showLevel ? await vehicleTelemetryState(vehicle.id) : null;
  const txs = await prisma.fuelTransaction.findMany({
    where: { driverId: profile.id },
    orderBy: { transactionDate: "desc" },
    take: 20,
    select: {
      id: true,
      stationName: true,
      liters: true,
      fuelType: true,
      transactionDate: true,
      status: true,
      declineReason: false,
      isDemo: true,
    },
  });
  return {
    vehicle: vehicle
      ? {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          make: vehicle.make,
          model: vehicle.model,
          tankCapacityLiters: n(vehicle.tankCapacityLiters),
        }
      : null,
    trip: trip ? { id: trip.id, publicNumber: trip.publicNumber } : null,
    card: card
      ? {
          id: card.id,
          label: card.label,
          last4: card.last4,
          status: card.status,
          isDemo: card.isDemo,
          allowedFuelTypes: card.allowedFuelTypes,
          allowedFrom: card.allowedFromMinute,
          allowedTo: card.allowedToMinute,
        }
      : null,
    payment,
    remaining,
    fuelLevel:
      state && state.fuelLevel.status === "AVAILABLE"
        ? { liters: state.fuelLevel.value.liters, at: state.fuelLevel.recordedAt, demo: state.fuelLevel.demo }
        : null,
    fuelLevelVisible: showLevel,
    transactions: txs.map((t) => ({ ...t, liters: Number(t.liters) })),
  };
}
