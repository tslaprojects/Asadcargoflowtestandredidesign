/**
 * Fuel Anomaly Detection — прозрачные правила, без «AI-модели».
 *
 * Каждая топливная транзакция сопоставляется с GPS, уровнем топлива, ёмкостью бака, частотой заправок и маршрутом рейса.
 * Каждое правило даёт понятное объяснение и фиксированное число баллов. Итоговый балл (0–100) — сумма баллов, ограниченная 100.
 * Система не делает выводов о виновности: результат — «потенциальное несоответствие, требуется проверка».
 * Если данных для проверки нет, проверка получает статус NOT_AVAILABLE — значения не домысливаются.
 */
import type { FuelAnomalySeverity, FuelAnomalyType, FuelLevelSource, FuelMatchStatus } from "@/generated/prisma/enums";
import { haversineKm, projectOnSegment, type LatLng } from "@/lib/geo/distance";

export const FUEL_RULES = {
  /** Окно поиска GPS-позиции вокруг времени заправки, мин */
  gpsWindowMinutes: 30,
  /** Расстояние от АЗС, после которого фиксируется несоответствие, км */
  locationMismatchKm: 5,
  locationCriticalKm: 50,
  /** Окно поиска показаний уровня топлива вокруг заправки, мин */
  levelWindowMinutes: 120,
  /** Допустимое расхождение купленного и залитого топлива: max(л, % от заправки) */
  levelToleranceLiters: 15,
  levelTolerancePct: 5,
  /** Допуск на показания ёмкости бака, % */
  tankTolerancePct: 3,
  /** Две заправки одного автомобиля чаще этого интервала, мин */
  frequentRefuelMinutes: 120,
  /** Удаление АЗС от маршрута рейса, км */
  routeDeviationKm: 30,
  /** Падение уровня при выключенном двигателе: max(л, % бака) */
  dropMinLiters: 20,
  dropMinPctOfTank: 3,
  dropMaxGapHours: 6,
  weights: {
    LOCATION_MISMATCH: 40,
    TANK_CAPACITY_EXCEEDED: 40,
    FUEL_LEVEL_MISMATCH: 30,
    UNEXPECTED_FUEL_DROP: 35,
    FREQUENT_REFUELING: 15,
    ROUTE_DEVIATION: 15,
  } satisfies Record<FuelAnomalyType, number>,
};

export type FuelRuleConfig = typeof FUEL_RULES;

export type TelemetryPoint = {
  recordedAt: Date;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  engineOn: boolean | null;
  odometerKm: number | null;
  fuelLevelLiters: number | null;
  fuelLevelSource: FuelLevelSource | null;
  fuelUsedTotalL?: number | null;
  /** Откуда позиция: телематика или отметка водителя в приложении */
  positionSource?: string;
};

export type AnalysisTx = {
  id: string;
  liters: number;
  transactionDate: Date;
  latitude: number | null;
  longitude: number | null;
  stationName: string;
};

export type DetectedAnomaly = {
  type: FuelAnomalyType;
  score: number;
  severity: FuelAnomalySeverity;
  /** Нейтральная формулировка для владельца */
  explanation: string;
  details: Record<string, unknown>;
};

export type CheckStatus = "AVAILABLE" | "NOT_AVAILABLE";

export type FuelAnalysis = {
  checks: {
    gps: { status: CheckStatus; distanceKm?: number; positionAt?: string; positionSource?: string };
    fuelLevel: { status: CheckStatus; before?: number; after?: number; delta?: number; source?: FuelLevelSource; diff?: number };
    tank: { status: CheckStatus; capacity?: number };
    frequency: { status: CheckStatus; minutesSincePrevious?: number };
    route: { status: CheckStatus; distanceKm?: number };
  };
  anomalies: DetectedAnomaly[];
  score: number;
  risk: RiskLevel;
  matchStatus: FuelMatchStatus;
};

export type RiskLevel = "LOW" | "ATTENTION" | "HIGH" | "CRITICAL";

/** 0–20 низкий, 21–50 требует внимания, 51–80 высокий, 81–100 критический. */
export function riskLevel(score: number): RiskLevel {
  if (score <= 20) return "LOW";
  if (score <= 50) return "ATTENTION";
  if (score <= 80) return "HIGH";
  return "CRITICAL";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const l = (n: number) => `${Math.round(n)} л`;
const km = (n: number) => `${Math.round(n)} км`;
const MIN = 60_000;

/** Уровень до/после заправки: наибольший подъём уровня одного источника в окне вокруг заправки. */
export function levelChangeAround(points: TelemetryPoint[], at: Date, windowMinutes: number) {
  const from = at.getTime() - windowMinutes * MIN;
  const to = at.getTime() + windowMinutes * MIN;
  // Датчик уровня точнее CAN — если у него есть данные до и после, используется он; источники не смешиваются
  for (const source of ["FUEL_SENSOR", "CAN_J1939"] as FuelLevelSource[]) {
    const pts = points
      .filter(
        (p) => p.fuelLevelSource === source && p.fuelLevelLiters != null && p.recordedAt.getTime() >= from && p.recordedAt.getTime() <= to,
      )
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const hasBefore = pts.some((p) => p.recordedAt.getTime() <= at.getTime());
    const hasAfter = pts.some((p) => p.recordedAt.getTime() > at.getTime());
    if (!hasBefore || !hasAfter) continue;
    let best = { before: pts[0].fuelLevelLiters!, after: pts[0].fuelLevelLiters!, rise: -Infinity };
    let minSoFar = pts[0];
    for (const p of pts.slice(1)) {
      const rise = p.fuelLevelLiters! - minSoFar.fuelLevelLiters!;
      if (rise > best.rise && p.recordedAt.getTime() > at.getTime() - windowMinutes * MIN) {
        best = { before: minSoFar.fuelLevelLiters!, after: p.fuelLevelLiters!, rise };
      }
      if (p.fuelLevelLiters! < minSoFar.fuelLevelLiters! && p.recordedAt.getTime() <= at.getTime()) minSoFar = p;
    }
    if (best.rise === -Infinity) continue;
    return { source, before: best.before, after: best.after, delta: best.after - best.before };
  }
  return null;
}

function severityFor(type: FuelAnomalyType, details: Record<string, number>): FuelAnomalySeverity {
  switch (type) {
    case "TANK_CAPACITY_EXCEEDED":
      return "CRITICAL";
    case "LOCATION_MISMATCH":
      return details.distanceKm > FUEL_RULES.locationCriticalKm ? "CRITICAL" : "HIGH";
    case "FUEL_LEVEL_MISMATCH":
      return details.unexplained > details.liters / 2 ? "CRITICAL" : "HIGH";
    case "UNEXPECTED_FUEL_DROP":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

function anomaly(
  type: FuelAnomalyType,
  explanation: string,
  details: Record<string, number | string>,
  cfg: FuelRuleConfig,
): DetectedAnomaly {
  return {
    type,
    score: cfg.weights[type],
    severity: severityFor(type, details as Record<string, number>),
    explanation,
    details,
  };
}

export function analyzeFuelTransaction(input: {
  tx: AnalysisTx;
  tankCapacity: number | null;
  telemetry: TelemetryPoint[];
  /** Другие заправки того же автомобиля (фактически отпущенное топливо) */
  otherRefuels: { id: string; liters: number; transactionDate: Date }[];
  /** Точки маршрута рейса (если заправка привязана к рейсу) */
  route?: LatLng[] | null;
  config?: FuelRuleConfig;
}): FuelAnalysis {
  const cfg = input.config ?? FUEL_RULES;
  const { tx } = input;
  const at = tx.transactionDate.getTime();
  const anomalies: DetectedAnomaly[] = [];
  const checks: FuelAnalysis["checks"] = {
    gps: { status: "NOT_AVAILABLE" },
    fuelLevel: { status: "NOT_AVAILABLE" },
    tank: { status: input.tankCapacity ? "AVAILABLE" : "NOT_AVAILABLE", capacity: input.tankCapacity ?? undefined },
    frequency: { status: "AVAILABLE" },
    route: { status: "NOT_AVAILABLE" },
  };
  const station = tx.latitude != null && tx.longitude != null ? { lat: tx.latitude, lng: tx.longitude } : null;

  // 1. GPS: ближайшая по времени позиция автомобиля
  if (station) {
    const positions = input.telemetry
      .filter((p) => p.latitude != null && p.longitude != null && Math.abs(p.recordedAt.getTime() - at) <= cfg.gpsWindowMinutes * MIN)
      .sort((a, b) => Math.abs(a.recordedAt.getTime() - at) - Math.abs(b.recordedAt.getTime() - at));
    const pos = positions[0];
    if (pos) {
      const distanceKm = r1(haversineKm(station, { lat: pos.latitude!, lng: pos.longitude! }));
      checks.gps = { status: "AVAILABLE", distanceKm, positionAt: pos.recordedAt.toISOString(), positionSource: pos.positionSource };
      if (distanceKm > cfg.locationMismatchKm) {
        anomalies.push(
          anomaly(
            "LOCATION_MISMATCH",
            `По топливной карте зарегистрирована заправка ${l(tx.liters)} на АЗС «${tx.stationName}», а GPS автомобиля в это время находился в ${km(distanceKm)} от АЗС. Требуется проверка.`,
            { distanceKm, thresholdKm: cfg.locationMismatchKm, positionLat: pos.latitude!, positionLng: pos.longitude! },
            cfg,
          ),
        );
      }
    }
  }

  // 2. Уровень топлива до/после
  const level = levelChangeAround(input.telemetry, tx.transactionDate, cfg.levelWindowMinutes);
  if (level) {
    const diff = r1(tx.liters - level.delta);
    checks.fuelLevel = {
      status: "AVAILABLE",
      before: r1(level.before),
      after: r1(level.after),
      delta: r1(level.delta),
      source: level.source,
      diff,
    };
    const tolerance = Math.max(cfg.levelToleranceLiters, (tx.liters * cfg.levelTolerancePct) / 100);
    if (diff > tolerance) {
      anomalies.push(
        anomaly(
          "FUEL_LEVEL_MISMATCH",
          `По топливной карте зарегистрирована заправка ${l(tx.liters)}, а ${level.source === "FUEL_SENSOR" ? "датчик уровня топлива" : "телематическая система (CAN)"} зафиксировал увеличение уровня на ${l(Math.max(0, level.delta))}. Расхождение — ${l(diff)}. Требуется проверка.`,
          {
            liters: tx.liters,
            before: r1(level.before),
            after: r1(level.after),
            delta: r1(level.delta),
            unexplained: diff,
            tolerance: r1(tolerance),
          },
          cfg,
        ),
      );
    }
  }

  // 3. Ёмкость бака
  if (input.tankCapacity) {
    const cap = input.tankCapacity * (1 + cfg.tankTolerancePct / 100);
    const before = level?.before;
    const exceeds = before != null ? before + tx.liters > cap : tx.liters > cap;
    if (exceeds) {
      anomalies.push(
        anomaly(
          "TANK_CAPACITY_EXCEEDED",
          before != null
            ? `Ёмкость бака ${l(input.tankCapacity)}, до заправки было ${l(before)} — физически можно залить не более ${l(Math.max(0, input.tankCapacity - before))}, а по карте зарегистрировано ${l(tx.liters)}. Требуется проверка.`
            : `По карте зарегистрировано ${l(tx.liters)} при ёмкости бака ${l(input.tankCapacity)}. Требуется проверка.`,
          {
            capacity: input.tankCapacity,
            before: before ?? -1,
            liters: tx.liters,
            maxPossible: before != null ? r1(Math.max(0, input.tankCapacity - before)) : input.tankCapacity,
          },
          cfg,
        ),
      );
    }
  }

  // 4. Частота заправок
  const previous = input.otherRefuels
    .filter(
      (o) => o.id !== tx.id && o.transactionDate.getTime() <= at && at - o.transactionDate.getTime() < cfg.frequentRefuelMinutes * MIN,
    )
    .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime())[0];
  if (previous) {
    const minutes = Math.round((at - previous.transactionDate.getTime()) / MIN);
    checks.frequency = { status: "AVAILABLE", minutesSincePrevious: minutes };
    anomalies.push(
      anomaly(
        "FREQUENT_REFUELING",
        `Повторная заправка через ${minutes} мин после предыдущей (${l(previous.liters)}, затем ${l(tx.liters)}). Требуется проверка.`,
        { minutes, previousLiters: previous.liters, liters: tx.liters, previousTransactionId: previous.id },
        cfg,
      ),
    );
  }

  // 5. Отклонение от маршрута рейса
  if (station && input.route && input.route.length >= 2) {
    let min = Infinity;
    for (let i = 0; i < input.route.length - 1; i++)
      min = Math.min(min, projectOnSegment(station, input.route[i], input.route[i + 1]).distanceKm);
    const distanceKm = r1(min);
    checks.route = { status: "AVAILABLE", distanceKm };
    if (distanceKm > cfg.routeDeviationKm) {
      anomalies.push(
        anomaly(
          "ROUTE_DEVIATION",
          `АЗС «${tx.stationName}» находится в ${km(distanceKm)} от маршрута рейса. Возможен заезд с отклонением от маршрута — требуется проверка.`,
          { distanceKm, thresholdKm: cfg.routeDeviationKm },
          cfg,
        ),
      );
    }
  }

  const score = Math.min(
    100,
    anomalies.reduce((a, x) => a + x.score, 0),
  );
  const verified = [checks.gps.status, checks.fuelLevel.status].filter((s) => s === "AVAILABLE").length;
  const matchStatus: FuelMatchStatus = anomalies.length
    ? "MISMATCH"
    : verified === 2
      ? "MATCHED"
      : verified === 1
        ? "PARTIALLY_VERIFIED"
        : "UNVERIFIED";
  return { checks, anomalies, score, risk: riskLevel(score), matchStatus };
}

/** Резкое падение уровня топлива при стоящем автомобиле с выключенным двигателем. */
export function detectFuelDrops(points: TelemetryPoint[], tankCapacity: number | null, cfg: FuelRuleConfig = FUEL_RULES) {
  const result: (DetectedAnomaly & { from: Date; to: Date })[] = [];
  for (const source of ["FUEL_SENSOR", "CAN_J1939"] as FuelLevelSource[]) {
    const pts = points
      .filter((p) => p.fuelLevelSource === source && p.fuelLevelLiters != null)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const gapH = (b.recordedAt.getTime() - a.recordedAt.getTime()) / 3_600_000;
      const drop = a.fuelLevelLiters! - b.fuelLevelLiters!;
      const threshold = Math.max(cfg.dropMinLiters, tankCapacity ? (tankCapacity * cfg.dropMinPctOfTank) / 100 : 0);
      // Без данных о двигателе/скорости вывод не делается
      const parked = a.engineOn === false && b.engineOn === false;
      const moved =
        a.odometerKm != null && b.odometerKm != null ? b.odometerKm - a.odometerKm > 1 : (a.speedKmh ?? 0) > 3 || (b.speedKmh ?? 0) > 3;
      if (parked && !moved && gapH <= cfg.dropMaxGapHours && drop > threshold) {
        result.push({
          ...anomaly(
            "UNEXPECTED_FUEL_DROP",
            `Уровень топлива снизился на ${l(drop)} (с ${l(a.fuelLevelLiters!)} до ${l(b.fuelLevelLiters!)}) за ${Math.max(1, Math.round(gapH * 60))} мин, пока автомобиль стоял с выключенным двигателем. Требуется проверка.`,
            { drop: r1(drop), before: a.fuelLevelLiters!, after: b.fuelLevelLiters!, minutes: Math.round(gapH * 60), source },
            cfg,
          ),
          from: a.recordedAt,
          to: b.recordedAt,
        });
      }
    }
    if (pts.length) break; // один источник, без смешивания
  }
  return result;
}
