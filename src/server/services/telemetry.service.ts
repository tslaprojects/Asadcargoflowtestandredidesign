import "server-only";
import type { z } from "zod";
import type { FuelLevelSource, TelemetrySource } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import type { Metric, RawTelemetry, TelematicsProvider } from "@/lib/fuel/providers";
import type { telemetryReadingSchema } from "@/lib/validation/fuel";
import { TRIP_STATUSES } from "@/lib/state-machine/order-state-machine";
import { detectVehicleFuelDrops, reanalyzeVehicleWindow } from "./fuel-analysis.service";
import { fuelScope, requireFleetVehicle } from "./fuel-access";

/**
 * Телематика: приём показаний (GPS, скорость, двигатель, одометр, уровень топлива с указанием источника, счётчик расхода)
 * и текущее состояние автомобиля. Показания приходят от провайдера/устройства (webhook, опрос) или из демо-симуляции.
 * Отсутствующий параметр хранится как null и показывается как «нет данных» — значения не выдумываются.
 */

type ReadingInput = z.output<typeof telemetryReadingSchema> | RawTelemetry;

export async function ingestTelemetry(input: {
  vehicleId: string;
  source: TelemetrySource;
  provider: string;
  readings: ReadingInput[];
  isDemo?: boolean;
}) {
  if (!input.readings.length) return { inserted: 0 };
  for (const r of input.readings) {
    if (r.fuelLevelLiters != null && !r.fuelLevelSource)
      throw errors.validation("Для уровня топлива обязателен источник (CAN_J1939 или FUEL_SENSOR).");
  }
  const res = await prisma.telemetryReading.createMany({
    data: input.readings.map((r) => ({
      vehicleId: input.vehicleId,
      source: input.source,
      provider: input.provider,
      recordedAt: r.recordedAt,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      speedKmh: r.speedKmh ?? null,
      heading: r.heading ?? null,
      engineOn: r.engineOn ?? null,
      odometerKm: r.odometerKm ?? null,
      fuelLevelLiters: r.fuelLevelLiters ?? null,
      fuelLevelSource: r.fuelLevelSource ?? null,
      fuelUsedTotalL: r.fuelUsedTotalL ?? null,
      isDemo: input.isDemo ?? false,
    })),
    // Повторная доставка тех же показаний не создаёт дубликатов
    skipDuplicates: true,
  });
  const times = input.readings.map((r) => r.recordedAt.getTime());
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times));
  // Новые данные → пересчёт сопоставления заправок и поиск падений уровня
  await reanalyzeVehicleWindow(input.vehicleId, from, to);
  await detectVehicleFuelDrops(input.vehicleId, from, to);
  return { inserted: res.count };
}

/** Приём от устройства/провайдера по идентификатору устройства. */
export async function ingestFromDevice(provider: string, deviceId: string, readings: ReadingInput[]) {
  const v = await prisma.vehicle.findFirst({ where: { telematicsProvider: provider, telematicsDeviceId: deviceId, deletedAt: null } });
  if (!v) throw errors.notFound("Устройство не привязано ни к одному автомобилю.");
  return ingestTelemetry({ vehicleId: v.id, source: "TELEMATICS", provider, readings });
}

/** Ручной ввод показаний владельцем (например, уровень по щупу). Помечается источником MANUAL. */
export async function addManualReading(actor: Actor, vehicleId: string, reading: z.output<typeof telemetryReadingSchema>) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  await requireFleetVehicle(scope.companyId, vehicleId);
  return ingestTelemetry({ vehicleId, source: "MANUAL", provider: "manual", readings: [reading] });
}

// ─────────── Текущее состояние (TelematicsProvider на базе сохранённых показаний) ───────────

const NA = { status: "NOT_AVAILABLE" } as const;

async function latest(vehicleId: string, where: object) {
  return prisma.telemetryReading.findFirst({ where: { vehicleId, ...where }, orderBy: { recordedAt: "desc" } });
}

export const databaseTelematicsProvider: TelematicsProvider = {
  code: "cargoflow-db",
  title: "Сохранённые показания телематики",
  async getVehicleLocation(vehicleId) {
    const r = await latest(vehicleId, { latitude: { not: null }, longitude: { not: null } });
    return r
      ? {
          status: "AVAILABLE",
          value: { latitude: r.latitude!, longitude: r.longitude!, speedKmh: r.speedKmh, heading: r.heading },
          recordedAt: r.recordedAt,
          source: r.source,
          demo: r.isDemo,
        }
      : NA;
  },
  async getFuelLevel(vehicleId) {
    const r = await latest(vehicleId, { fuelLevelLiters: { not: null } });
    return r
      ? {
          status: "AVAILABLE",
          value: { liters: r.fuelLevelLiters!, source: r.fuelLevelSource as FuelLevelSource },
          recordedAt: r.recordedAt,
          source: r.source,
          demo: r.isDemo,
        }
      : NA;
  },
  async getFuelConsumption(vehicleId) {
    const r = await latest(vehicleId, { fuelUsedTotalL: { not: null } });
    return r
      ? { status: "AVAILABLE", value: { totalUsedL: r.fuelUsedTotalL! }, recordedAt: r.recordedAt, source: r.source, demo: r.isDemo }
      : NA;
  },
  async getOdometer(vehicleId) {
    const r = await latest(vehicleId, { odometerKm: { not: null } });
    return r ? { status: "AVAILABLE", value: r.odometerKm!, recordedAt: r.recordedAt, source: r.source, demo: r.isDemo } : NA;
  },
  async getEngineStatus(vehicleId) {
    const r = await latest(vehicleId, { engineOn: { not: null } });
    return r ? { status: "AVAILABLE", value: { engineOn: r.engineOn! }, recordedAt: r.recordedAt, source: r.source, demo: r.isDemo } : NA;
  },
  async getVehicleStatus(vehicleId) {
    const r = await latest(vehicleId, {});
    return r
      ? {
          status: "AVAILABLE",
          value: { online: Date.now() - r.recordedAt.getTime() < 30 * 60_000, lastSeenAt: r.recordedAt },
          recordedAt: r.recordedAt,
          source: r.source,
          demo: r.isDemo,
        }
      : NA;
  },
};

export type VehicleTelemetryState = {
  location: Metric<{ latitude: number; longitude: number; speedKmh: number | null; heading: number | null }>;
  fuelLevel: Metric<{ liters: number; source: FuelLevelSource }>;
  odometer: Metric<number>;
  engine: Metric<{ engineOn: boolean }>;
  consumptionCounter: Metric<{ totalUsedL: number }>;
  status: Metric<{ online: boolean; lastSeenAt: Date }>;
  /** true — есть демо-показания (интерфейс показывает пометку DEMO DATA) */
  demo: boolean;
};

export async function vehicleTelemetryState(vehicleId: string): Promise<VehicleTelemetryState> {
  const p = databaseTelematicsProvider;
  const [location, fuelLevel, odometer, engine, consumptionCounter, status] = await Promise.all([
    p.getVehicleLocation(vehicleId),
    p.getFuelLevel(vehicleId),
    p.getOdometer(vehicleId),
    p.getEngineStatus(vehicleId),
    p.getFuelConsumption(vehicleId),
    p.getVehicleStatus(vehicleId),
  ]);
  // Позиция без телематики: последняя отметка водителя в приложении по текущему рейсу
  let loc = location;
  if (loc.status === "NOT_AVAILABLE") {
    const ev = await prisma.trackingEvent.findFirst({
      where: {
        order: { vehicleId, currentStatus: { in: [...TRIP_STATUSES, "DELIVERED"] } },
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { recordedAt: "desc" },
    });
    if (ev)
      loc = {
        status: "AVAILABLE",
        value: { latitude: ev.latitude!, longitude: ev.longitude!, speedKmh: null, heading: null },
        recordedAt: ev.recordedAt,
        source: "DRIVER_APP",
        demo: false,
      };
  }
  const all = [loc, fuelLevel, odometer, engine, consumptionCounter, status];
  return {
    location: loc,
    fuelLevel,
    odometer,
    engine,
    consumptionCounter,
    status,
    demo: all.some((m) => m.status === "AVAILABLE" && m.demo),
  };
}
