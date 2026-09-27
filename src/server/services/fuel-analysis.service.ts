import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { FuelAnomalyType } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import { prisma, type Tx } from "@/lib/db/prisma";
import { analyzeFuelTransaction, detectFuelDrops, FUEL_RULES, type DetectedAnomaly, type TelemetryPoint } from "@/lib/fuel/anomaly-rules";
import { FUEL_TX_FUELED } from "@/lib/fuel/transaction-state-machine";
import { label } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import { CARRIER_OFFICE_ROLES, companyUserIds, notify } from "./notification.service";

/**
 * Fuel Analysis: сопоставление заправок с GPS/уровнем топлива/баком/маршрутом и поиск падений уровня.
 * Правила — src/lib/fuel/anomaly-rules.ts. Здесь — загрузка данных, сохранение результата, аномалии и уведомления.
 * Повторный анализ идемпотентен (ключ аномалии dedupeKey); проверенные владельцем аномалии не перезаписываются.
 */

const HOUR = 3_600_000;

/** Точки телеметрии автомобиля + отметки водителя из приложения (TrackingEvent) как источник позиции. */
export async function telemetryPoints(vehicleId: string, from: Date, to: Date, orderId?: string | null): Promise<TelemetryPoint[]> {
  const [readings, driverEvents] = await Promise.all([
    prisma.telemetryReading.findMany({ where: { vehicleId, recordedAt: { gte: from, lte: to } }, orderBy: { recordedAt: "asc" } }),
    orderId
      ? prisma.trackingEvent.findMany({
          where: { orderId, latitude: { not: null }, longitude: { not: null }, recordedAt: { gte: from, lte: to } },
          select: { latitude: true, longitude: true, recordedAt: true },
        })
      : Promise.resolve([]),
  ]);
  return [
    ...readings.map((r) => ({
      recordedAt: r.recordedAt,
      latitude: r.latitude,
      longitude: r.longitude,
      speedKmh: r.speedKmh,
      engineOn: r.engineOn,
      odometerKm: r.odometerKm,
      fuelLevelLiters: r.fuelLevelLiters,
      fuelLevelSource: r.fuelLevelSource,
      fuelUsedTotalL: r.fuelUsedTotalL,
      positionSource: r.source,
    })),
    ...driverEvents.map((e) => ({
      recordedAt: e.recordedAt,
      latitude: e.latitude,
      longitude: e.longitude,
      speedKmh: null,
      engineOn: null,
      odometerKm: null,
      fuelLevelLiters: null,
      fuelLevelSource: null,
      positionSource: "DRIVER_APP",
    })),
  ];
}

async function vehicleLabel(tx: Tx, vehicleId: string) {
  const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { make: true, model: true, plateNumber: true } });
  return v ? `${v.make} ${v.model} (${v.plateNumber})` : "автомобиля";
}

async function upsertAnomalies(
  tx: Tx,
  base: {
    companyId: string;
    vehicleId: string;
    driverId: string | null;
    fuelTransactionId: string | null;
    orderId: string | null;
    isDemo: boolean;
  },
  found: (DetectedAnomaly & { dedupeKey: string; detectedAt?: Date })[],
  staleScope: { fuelTransactionId?: string },
) {
  const created: { id: string; type: FuelAnomalyType; severity: string; explanation: string }[] = [];
  for (const a of found) {
    const existing = await tx.fuelAnomaly.findUnique({ where: { dedupeKey: a.dedupeKey } });
    if (!existing) {
      const row = await tx.fuelAnomaly.create({
        data: {
          ...base,
          type: a.type,
          severity: a.severity,
          score: a.score,
          explanation: a.explanation,
          details: a.details as Prisma.InputJsonValue,
          dedupeKey: a.dedupeKey,
          detectedAt: a.detectedAt ?? new Date(),
        },
      });
      created.push(row);
      await audit(
        null,
        {
          action: AuditAction.FUEL_ANOMALY_DETECTED,
          entityType: "FuelAnomaly",
          entityId: row.id,
          companyId: base.companyId,
          newValue: {
            type: a.type,
            severity: a.severity,
            score: a.score,
            fuelTransactionId: base.fuelTransactionId,
            vehicleId: base.vehicleId,
          },
        },
        tx,
      );
    } else if (existing.status === "OPEN") {
      await tx.fuelAnomaly.update({
        where: { id: existing.id },
        data: { severity: a.severity, score: a.score, explanation: a.explanation, details: a.details as Prisma.InputJsonValue },
      });
    }
  }
  // Аномалии, которые при повторном анализе (поступили новые данные) больше не подтверждаются
  if (staleScope.fuelTransactionId) {
    await tx.fuelAnomaly.updateMany({
      where: {
        fuelTransactionId: staleScope.fuelTransactionId,
        status: "OPEN",
        dedupeKey: { notIn: found.map((f) => f.dedupeKey) },
      },
      data: {
        status: "DISMISSED",
        reviewComment: "Не подтвердилось при повторном анализе: поступили новые данные телематики.",
        reviewedAt: new Date(),
      },
    });
  }
  // Уведомление владельцу и диспетчерам — только о высоких и критических, нейтральной формулировкой
  const important = created.filter((c) => c.severity === "HIGH" || c.severity === "CRITICAL");
  if (important.length) {
    const name = await vehicleLabel(tx, base.vehicleId);
    for (const c of important) {
      await notify(tx, {
        userIds: await companyUserIds(tx, base.companyId, CARRIER_OFFICE_ROLES),
        type: "FUEL_ANOMALY",
        title: `${c.severity === "CRITICAL" ? "🔴 " : "🟠 "}Требуется проверка: ${name}`,
        body: `${label("FuelAnomalyType", c.type)}. ${c.explanation}`,
        entityType: "FuelAnomaly",
        entityId: c.id,
        link: `/fuel/anomalies/${c.id}`,
      });
    }
  }
  return created;
}

/** Анализ одной заправки. Возвращает итог сопоставления. */
export async function analyzeTransaction(transactionId: string) {
  const t = await prisma.fuelTransaction.findUnique({
    where: { id: transactionId },
    include: {
      vehicle: { select: { tankCapacityLiters: true } },
      order: { select: { load: { select: { stops: { orderBy: { sequence: "asc" }, select: { latitude: true, longitude: true } } } } } },
    },
  });
  if (!t || !FUEL_TX_FUELED.includes(t.status) || !t.vehicleId) return null;
  const at = t.transactionDate.getTime();
  const [points, others] = await Promise.all([
    telemetryPoints(t.vehicleId, new Date(at - 3 * HOUR), new Date(at + 3 * HOUR), t.orderId),
    prisma.fuelTransaction.findMany({
      where: {
        vehicleId: t.vehicleId,
        id: { not: t.id },
        status: { in: FUEL_TX_FUELED },
        transactionDate: { gte: new Date(at - 24 * HOUR), lte: new Date(at + 24 * HOUR) },
      },
      select: { id: true, liters: true, transactionDate: true },
    }),
  ]);
  const route = t.order?.load.stops
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({ lat: s.latitude!, lng: s.longitude! }));
  const result = analyzeFuelTransaction({
    tx: {
      id: t.id,
      liters: Number(t.liters),
      transactionDate: t.transactionDate,
      latitude: t.latitude,
      longitude: t.longitude,
      stationName: t.stationName,
    },
    tankCapacity: t.vehicle?.tankCapacityLiters ? Number(t.vehicle.tankCapacityLiters) : null,
    telemetry: points,
    otherRefuels: others.map((o) => ({ id: o.id, liters: Number(o.liters), transactionDate: o.transactionDate })),
    route: route && route.length >= 2 ? route : null,
  });
  await prisma.$transaction(async (tx) => {
    await tx.fuelTransaction.update({
      where: { id: t.id },
      data: {
        matchStatus: result.matchStatus,
        anomalyScore: result.score,
        levelBefore: result.checks.fuelLevel.before ?? null,
        levelAfter: result.checks.fuelLevel.after ?? null,
        levelSource: result.checks.fuelLevel.source ?? null,
        gpsDistanceKm: result.checks.gps.distanceKm ?? null,
        analysis: { ...result, rules: { weights: FUEL_RULES.weights } } as unknown as Prisma.InputJsonValue,
        analyzedAt: new Date(),
      },
    });
    await upsertAnomalies(
      tx,
      {
        companyId: t.companyId,
        vehicleId: t.vehicleId!,
        driverId: t.driverId,
        fuelTransactionId: t.id,
        orderId: t.orderId,
        isDemo: t.isDemo,
      },
      result.anomalies.map((a) => ({ ...a, dedupeKey: `tx:${t.id}:${a.type}`, detectedAt: t.transactionDate })),
      { fuelTransactionId: t.id },
    );
  });
  return result;
}

/** Повторный анализ заправок автомобиля в окне (после поступления новых показаний). */
export async function reanalyzeVehicleWindow(vehicleId: string, from: Date, to: Date) {
  const txs = await prisma.fuelTransaction.findMany({
    where: {
      vehicleId,
      status: { in: FUEL_TX_FUELED },
      transactionDate: { gte: new Date(from.getTime() - 3 * HOUR), lte: new Date(to.getTime() + 3 * HOUR) },
    },
    select: { id: true },
  });
  for (const t of txs) {
    try {
      await analyzeTransaction(t.id);
    } catch (e) {
      logger.error("fuel.reanalyze.failed", { transactionId: t.id, error: e });
    }
  }
  return txs.length;
}

/** Поиск резкого падения уровня на стоянке. */
export async function detectVehicleFuelDrops(vehicleId: string, from: Date, to: Date) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { companyId: true, tankCapacityLiters: true } });
  if (!v) return [];
  const points = await telemetryPoints(vehicleId, new Date(from.getTime() - 6 * HOUR), to);
  const drops = detectFuelDrops(points, v.tankCapacityLiters ? Number(v.tankCapacityLiters) : null);
  if (!drops.length) return [];
  const card = await prisma.fuelCard.findFirst({ where: { vehicleId, status: "ACTIVE" }, select: { driverId: true } });
  const demo = await prisma.telemetryReading.count({ where: { vehicleId, isDemo: true, recordedAt: { gte: from, lte: to } } });
  return prisma.$transaction((tx) =>
    upsertAnomalies(
      tx,
      { companyId: v.companyId, vehicleId, driverId: card?.driverId ?? null, fuelTransactionId: null, orderId: null, isDemo: demo > 0 },
      drops.map((d) => ({ ...d, dedupeKey: `drop:${vehicleId}:${d.from.toISOString()}`, detectedAt: d.to })),
      {},
    ),
  );
}
