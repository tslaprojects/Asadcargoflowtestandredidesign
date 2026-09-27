import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { FuelLevelSource } from "@/generated/prisma/enums";
import type { FuelCardLimits } from "./limits";

/**
 * Integration Layer модуля Fleet Fuel Control. Бизнес-логика CargoFlow не зависит от конкретного поставщика.
 *
 *  - FuelCardProvider — выпуск, блокировка и лимиты топливных карт (процессинг топливных карт / банк).
 *    CargoFlow хранит только безопасный идентификатор карты у провайдера и последние 4 цифры — никаких номеров, PIN, CVV.
 *  - TelematicsProvider — позиция, уровень топлива (CAN/J1939 или отдельный датчик), расход, одометр, двигатель.
 *    Каждый показатель возвращается со статусом AVAILABLE / NOT_AVAILABLE: если устройство его не передаёт, значение не выдумывается.
 *  - GPS — существующий TrackingProvider (src/lib/tracking/provider.ts) и отметки водителя в приложении.
 */

// ─────────── Топливные карты ───────────

export type IssuedCard = { providerCardId: string; last4: string | null; expiresAt: Date | null };

export interface FuelCardProvider {
  readonly code: string;
  readonly title: string;
  /** true — демо-режим: карты и операции симулируются, реальные деньги и топливо не участвуют */
  readonly demo: boolean;
  issueCard(req: { companyId: string; label: string }): Promise<IssuedCard>;
  setCardStatus(providerCardId: string, status: "ACTIVE" | "BLOCKED"): Promise<void>;
  syncLimits(providerCardId: string, limits: FuelCardLimits): Promise<void>;
}

export const demoFuelCardProvider: FuelCardProvider = {
  code: "demo",
  title: "Демо-процессинг топливных карт",
  demo: true,
  async issueCard() {
    return {
      providerCardId: `demo_card_${randomBytes(12).toString("hex")}`,
      last4: String(randomInt(0, 10_000)).padStart(4, "0"),
      expiresAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60_000),
    };
  },
  async setCardStatus() {},
  async syncLimits() {},
};

const CARD_PROVIDERS: Record<string, FuelCardProvider> = { demo: demoFuelCardProvider };

export function getFuelCardProvider(): FuelCardProvider {
  return CARD_PROVIDERS[process.env.FUEL_CARD_PROVIDER || "demo"] ?? demoFuelCardProvider;
}

export function fuelCardProviderByCode(code: string): FuelCardProvider | null {
  return CARD_PROVIDERS[code] ?? null;
}

// ─────────── Телематика ───────────

export type Metric<T> = { status: "AVAILABLE"; value: T; recordedAt: Date; source: string; demo: boolean } | { status: "NOT_AVAILABLE" };

export type RawTelemetry = {
  recordedAt: Date;
  latitude?: number | null;
  longitude?: number | null;
  speedKmh?: number | null;
  heading?: number | null;
  engineOn?: boolean | null;
  odometerKm?: number | null;
  fuelLevelLiters?: number | null;
  fuelLevelSource?: FuelLevelSource | null;
  fuelUsedTotalL?: number | null;
};

export interface TelematicsProvider {
  readonly code: string;
  readonly title: string;
  getVehicleLocation(
    vehicleId: string,
  ): Promise<Metric<{ latitude: number; longitude: number; speedKmh: number | null; heading: number | null }>>;
  getFuelLevel(vehicleId: string): Promise<Metric<{ liters: number; source: FuelLevelSource }>>;
  getFuelConsumption(vehicleId: string): Promise<Metric<{ totalUsedL: number }>>;
  getOdometer(vehicleId: string): Promise<Metric<number>>;
  getEngineStatus(vehicleId: string): Promise<Metric<{ engineOn: boolean }>>;
  getVehicleStatus(vehicleId: string): Promise<Metric<{ online: boolean; lastSeenAt: Date }>>;
}

/**
 * Внешний провайдер телематики, который CargoFlow опрашивает сам (pull).
 * Полученные показания сохраняются через TelemetryService.ingest — дальше работает общий TelematicsProvider на базе БД.
 */
export interface TelematicsPullProvider {
  readonly code: string;
  fetchReadings(deviceIds: string[], since: Date): Promise<{ deviceId: string; readings: RawTelemetry[] }[]>;
}

export const noopTelematicsPullProvider: TelematicsPullProvider = {
  code: "none",
  async fetchReadings() {
    return [];
  },
};
