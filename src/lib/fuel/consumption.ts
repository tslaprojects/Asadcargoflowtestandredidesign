/**
 * Расход топлива. Считается только по реальным данным; если данных нет — NOT_AVAILABLE.
 *  - CAN_COUNTER: разница накопительного счётчика израсходованного топлива (CAN/J1939);
 *  - LEVEL_BALANCE: уровень в начале + заправки за период − уровень в конце (один источник уровня);
 *  - PURCHASES: только по заправкам (приблизительно; используется для отчёта по рейсу, если телематики нет).
 * Пробег — по одометру; если его нет, отчёт по рейсу использует оценку расстояния маршрута (с пометкой).
 */
import type { FuelLevelSource } from "@/generated/prisma/enums";
import type { TelemetryPoint } from "./anomaly-rules";

export type ConsumptionMethod = "CAN_COUNTER" | "LEVEL_BALANCE" | "PURCHASES";

export type Consumption = {
  distanceKm: number | null;
  distanceSource: "ODOMETER" | "ROUTE_ESTIMATE" | null;
  fuelUsedL: number | null;
  method: ConsumptionMethod | null;
  per100Km: number | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeConsumption(input: {
  telemetry: TelemetryPoint[];
  purchases: { at: Date; liters: number }[];
  from: Date;
  to: Date;
  /** Оценка расстояния маршрута, если одометра нет */
  routeEstimateKm?: number | null;
}): Consumption {
  const inRange = input.telemetry
    .filter((p) => p.recordedAt >= input.from && p.recordedAt <= input.to)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const odo = inRange.filter((p) => p.odometerKm != null);
  let distanceKm: number | null = null;
  let distanceSource: Consumption["distanceSource"] = null;
  if (odo.length >= 2) {
    distanceKm = r1(odo[odo.length - 1].odometerKm! - odo[0].odometerKm!);
    distanceSource = "ODOMETER";
  } else if (input.routeEstimateKm) {
    distanceKm = r1(input.routeEstimateKm);
    distanceSource = "ROUTE_ESTIMATE";
  }

  let fuelUsedL: number | null = null;
  let method: ConsumptionMethod | null = null;
  const counter = inRange.filter((p) => p.fuelUsedTotalL != null);
  if (counter.length >= 2) {
    fuelUsedL = counter[counter.length - 1].fuelUsedTotalL! - counter[0].fuelUsedTotalL!;
    method = "CAN_COUNTER";
  } else {
    for (const source of ["FUEL_SENSOR", "CAN_J1939"] as FuelLevelSource[]) {
      const lv = inRange.filter((p) => p.fuelLevelSource === source && p.fuelLevelLiters != null);
      if (lv.length < 2) continue;
      const first = lv[0];
      const last = lv[lv.length - 1];
      const purchased = input.purchases.filter((x) => x.at > first.recordedAt && x.at <= last.recordedAt).reduce((a, x) => a + x.liters, 0);
      fuelUsedL = first.fuelLevelLiters! + purchased - last.fuelLevelLiters!;
      method = "LEVEL_BALANCE";
      break;
    }
    if (fuelUsedL == null && input.purchases.length) {
      fuelUsedL = input.purchases.reduce((a, x) => a + x.liters, 0);
      method = "PURCHASES";
    }
  }
  if (fuelUsedL != null) fuelUsedL = r1(Math.max(0, fuelUsedL));
  const per100Km = fuelUsedL != null && distanceKm != null && distanceKm > 1 ? r1((fuelUsedL / distanceKm) * 100) : null;
  return { distanceKm, distanceSource, fuelUsedL, method, per100Km };
}

/** Отклонение от нормы, %: (33,5 − 30) / 30 = +11,7%. */
export function normDeviationPct(actual: number | null, norm: number | null): number | null {
  if (actual == null || !norm) return null;
  return Math.round(((actual - norm) / norm) * 1000) / 10;
}

export const CONSUMPTION_METHOD_LABELS: Record<ConsumptionMethod, string> = {
  CAN_COUNTER: "по счётчику топлива (CAN)",
  LEVEL_BALANCE: "по уровню бака и заправкам",
  PURCHASES: "только по заправкам (приблизительно)",
};
