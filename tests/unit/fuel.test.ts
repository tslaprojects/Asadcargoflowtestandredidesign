import { describe, expect, it } from "vitest";
import { analyzeFuelTransaction, detectFuelDrops, levelChangeAround, riskLevel, type TelemetryPoint } from "@/lib/fuel/anomaly-rules";
import { computeConsumption, normDeviationPct } from "@/lib/fuel/consumption";
import { checkFuelPurchase, inTimeWindow, periodStarts, remainingLiters, type FuelCardLimits } from "@/lib/fuel/limits";
import { canFuelTxTransition } from "@/lib/fuel/transaction-state-machine";

const T = new Date("2026-10-01T06:30:00Z"); // 12:30 Алматы
const min = (m: number) => new Date(T.getTime() + m * 60_000);
const ALMATY = { lat: 43.2389, lng: 76.8897 };
const MOSCOW = { lat: 55.7558, lng: 37.6173 };
const SHYMKENT = { lat: 42.3417, lng: 69.5901 };

function pt(m: number, over: Partial<TelemetryPoint>): TelemetryPoint {
  return {
    recordedAt: min(m),
    latitude: null,
    longitude: null,
    speedKmh: null,
    engineOn: null,
    odometerKm: null,
    fuelLevelLiters: null,
    fuelLevelSource: null,
    ...over,
  };
}
const level = (m: number, liters: number, source: "CAN_J1939" | "FUEL_SENSOR" = "FUEL_SENSOR") =>
  pt(m, { fuelLevelLiters: liters, fuelLevelSource: source });
const gps = (m: number, p: { lat: number; lng: number }) => pt(m, { latitude: p.lat, longitude: p.lng });

const tx = (liters: number, at = ALMATY) => ({
  id: "tx",
  liters,
  transactionDate: T,
  latitude: at.lat,
  longitude: at.lng,
  stationName: "АЗС Демо",
});

function run(liters: number, telemetry: TelemetryPoint[], over: Partial<Parameters<typeof analyzeFuelTransaction>[0]> = {}) {
  return analyzeFuelTransaction({ tx: tx(liters), tankCapacity: 1000, telemetry, otherRefuels: [], ...over });
}
const types = (a: ReturnType<typeof run>) => a.anomalies.map((x) => x.type);

describe("Сопоставление заправки с телематикой", () => {
  it("до 200 л + заправка 300 л → после 500 л: MATCHED", () => {
    const a = run(300, [level(-20, 200), gps(-5, ALMATY), level(15, 500)]);
    expect(a.matchStatus).toBe("MATCHED");
    expect(a.anomalies).toEqual([]);
    expect(a.checks.fuelLevel).toMatchObject({ status: "AVAILABLE", before: 200, after: 500, delta: 300 });
    expect(a.score).toBe(0);
    expect(a.risk).toBe("LOW");
  });

  it("до 180 л, после 470 л при заправке 300 л — расхождение 10 л в пределах допуска: MATCHED", () => {
    const a = run(300, [level(-30, 180), gps(0, ALMATY), level(20, 470)]);
    expect(a.matchStatus).toBe("MATCHED");
    expect(a.checks.fuelLevel.diff).toBe(10);
  });

  it("до 200 л + заправка 300 л → после 250 л: FUEL_LEVEL_MISMATCH с нейтральным объяснением", () => {
    const a = run(300, [level(-20, 200), gps(0, ALMATY), level(15, 250)]);
    expect(types(a)).toEqual(["FUEL_LEVEL_MISMATCH"]);
    expect(a.matchStatus).toBe("MISMATCH");
    const x = a.anomalies[0];
    expect(x.explanation).toContain("зарегистрирована заправка 300 л");
    expect(x.explanation).toContain("увеличение уровня на 50 л");
    expect(x.explanation).toContain("Требуется проверка");
    expect(x.explanation.toLowerCase()).not.toMatch(/укра|краж|вор/);
    expect(x.severity).toBe("CRITICAL");
    expect(a.score).toBe(30);
  });

  it("АЗС в Алматы, GPS автомобиля в Москве: LOCATION_MISMATCH", () => {
    const a = run(300, [gps(-3, MOSCOW)]);
    expect(types(a)).toEqual(["LOCATION_MISMATCH"]);
    expect(a.checks.gps.distanceKm).toBeGreaterThan(3000);
    expect(a.anomalies[0].severity).toBe("CRITICAL");
    expect(a.anomalies[0].score).toBe(40);
  });

  it("GPS в 3 км от АЗС — норма; GPS старше окна — проверка недоступна", () => {
    expect(run(100, [gps(0, { lat: 43.26, lng: 76.9 })]).checks.gps.status).toBe("AVAILABLE");
    expect(types(run(100, [gps(0, { lat: 43.26, lng: 76.9 })]))).toEqual([]);
    const old = run(100, [gps(-180, MOSCOW)]);
    expect(old.checks.gps.status).toBe("NOT_AVAILABLE");
    expect(old.anomalies).toEqual([]);
  });

  it("бак 500 л, в баке 450 л, покупка 200 л: TANK_CAPACITY_EXCEEDED", () => {
    const a = run(200, [level(-10, 450), level(10, 500)], { tankCapacity: 500 });
    expect(types(a)).toContain("TANK_CAPACITY_EXCEEDED");
    const tank = a.anomalies.find((x) => x.type === "TANK_CAPACITY_EXCEEDED")!;
    expect(tank.explanation).toContain("не более 50 л");
    expect(tank.severity).toBe("CRITICAL");
  });

  it("без уровня топлива: заправка больше ёмкости бака тоже выявляется", () => {
    expect(types(run(600, [], { tankCapacity: 500 }))).toEqual(["TANK_CAPACITY_EXCEEDED"]);
  });

  it("нет телематики — UNVERIFIED, аномалии не придумываются", () => {
    const a = run(300, [], { tankCapacity: null });
    expect(a.matchStatus).toBe("UNVERIFIED");
    expect(a.anomalies).toEqual([]);
    expect(a.checks.gps.status).toBe("NOT_AVAILABLE");
    expect(a.checks.fuelLevel.status).toBe("NOT_AVAILABLE");
    expect(run(300, [gps(0, ALMATY)]).matchStatus).toBe("PARTIALLY_VERIFIED");
  });

  it("источники уровня не смешиваются: датчик приоритетнее CAN", () => {
    const pts = [level(-20, 200, "CAN_J1939"), level(10, 260, "FUEL_SENSOR"), level(15, 500, "CAN_J1939")];
    // У датчика нет показания «до» — используется только CAN
    expect(levelChangeAround(pts, T, 120)).toMatchObject({ source: "CAN_J1939", before: 200, after: 500 });
    const both = [...pts, level(-15, 205, "FUEL_SENSOR"), level(20, 503, "FUEL_SENSOR")];
    expect(levelChangeAround(both, T, 120)).toMatchObject({ source: "FUEL_SENSOR", before: 205, after: 503 });
  });

  it("частые заправки: 300 л утром и 300 л через 40 минут → FREQUENT_REFUELING", () => {
    const a = run(300, [], { otherRefuels: [{ id: "prev", liters: 300, transactionDate: min(-40) }] });
    expect(types(a)).toEqual(["FREQUENT_REFUELING"]);
    expect(a.anomalies[0].explanation).toContain("через 40 мин");
    expect(run(300, [], { otherRefuels: [{ id: "prev", liters: 300, transactionDate: min(-300) }] }).anomalies).toEqual([]);
  });

  it("АЗС далеко от маршрута рейса → ROUTE_DEVIATION (потенциальная аномалия)", () => {
    const route = [ALMATY, { lat: 51.1694, lng: 71.4491 }]; // Алматы → Астана
    const onRoute = analyzeFuelTransaction({
      tx: tx(200, { lat: 47.2, lng: 74.17 }),
      tankCapacity: null,
      telemetry: [],
      otherRefuels: [],
      route,
    });
    expect(onRoute.checks.route.status).toBe("AVAILABLE");
    expect(onRoute.anomalies).toEqual([]);
    const off = analyzeFuelTransaction({ tx: tx(200, SHYMKENT), tankCapacity: null, telemetry: [], otherRefuels: [], route });
    expect(off.anomalies.map((x) => x.type)).toEqual(["ROUTE_DEVIATION"]);
    expect(off.anomalies[0].severity).toBe("MEDIUM");
  });

  it("балл складывается из правил и ограничен 100; уровни риска", () => {
    const a = run(300, [level(-10, 900), gps(0, MOSCOW), level(10, 950)], {
      otherRefuels: [{ id: "p", liters: 100, transactionDate: min(-30) }],
    });
    expect(types(a).sort()).toEqual(["FREQUENT_REFUELING", "FUEL_LEVEL_MISMATCH", "LOCATION_MISMATCH", "TANK_CAPACITY_EXCEEDED"]);
    expect(a.score).toBe(100);
    expect(a.risk).toBe("CRITICAL");
    expect([riskLevel(0), riskLevel(20), riskLevel(21), riskLevel(50), riskLevel(51), riskLevel(81)]).toEqual([
      "LOW",
      "LOW",
      "ATTENTION",
      "ATTENTION",
      "HIGH",
      "CRITICAL",
    ]);
  });
});

describe("Падение уровня топлива на стоянке", () => {
  const parked = (m: number, liters: number) =>
    pt(m, { fuelLevelLiters: liters, fuelLevelSource: "FUEL_SENSOR", engineOn: false, speedKmh: 0, odometerKm: 1000 });
  it("двигатель выключен, уровень упал на 120 л → UNEXPECTED_FUEL_DROP", () => {
    const d = detectFuelDrops([parked(0, 480), parked(40, 360)], 1000);
    expect(d).toHaveLength(1);
    expect(d[0].type).toBe("UNEXPECTED_FUEL_DROP");
    expect(d[0].explanation).toContain("снизился на 120 л");
  });
  it("в движении или без данных о двигателе — не выявляется; малые колебания игнорируются", () => {
    const driving = [
      pt(0, { fuelLevelLiters: 480, fuelLevelSource: "FUEL_SENSOR", engineOn: true, speedKmh: 80 }),
      pt(60, { fuelLevelLiters: 450, fuelLevelSource: "FUEL_SENSOR", engineOn: true, speedKmh: 80 }),
    ];
    expect(detectFuelDrops(driving, 1000)).toEqual([]);
    const unknown = [level(0, 480), level(40, 300)];
    expect(detectFuelDrops(unknown, 1000)).toEqual([]);
    expect(detectFuelDrops([parked(0, 480), parked(40, 470)], 1000)).toEqual([]);
  });
});

describe("Расход топлива", () => {
  it("норма 30, факт 33,5 → +11,7%", () => {
    expect(normDeviationPct(33.5, 30)).toBe(11.7);
    expect(normDeviationPct(31.4, 30)).toBe(4.7);
    expect(normDeviationPct(null, 30)).toBeNull();
  });
  it("по счётчику CAN и одометру", () => {
    const c = computeConsumption({
      telemetry: [pt(0, { odometerKm: 10_000, fuelUsedTotalL: 5000 }), pt(600, { odometerKm: 10_800, fuelUsedTotalL: 5251.2 })],
      purchases: [],
      from: min(-1),
      to: min(700),
    });
    expect(c).toMatchObject({ distanceKm: 800, distanceSource: "ODOMETER", fuelUsedL: 251.2, method: "CAN_COUNTER", per100Km: 31.4 });
  });
  it("по уровню бака и заправкам", () => {
    const c = computeConsumption({
      telemetry: [
        pt(0, { odometerKm: 0, fuelLevelLiters: 400, fuelLevelSource: "CAN_J1939" }),
        pt(600, { odometerKm: 1000, fuelLevelLiters: 390, fuelLevelSource: "CAN_J1939" }),
      ],
      purchases: [{ at: min(300), liters: 300 }],
      from: min(-1),
      to: min(700),
    });
    expect(c.method).toBe("LEVEL_BALANCE");
    expect(c.fuelUsedL).toBe(310);
    expect(c.per100Km).toBe(31);
  });
  it("нет данных — NOT_AVAILABLE (null), а не выдуманное значение", () => {
    const c = computeConsumption({ telemetry: [], purchases: [], from: min(0), to: min(10) });
    expect(c).toEqual({ distanceKm: null, distanceSource: null, fuelUsedL: null, method: null, per100Km: null });
    const est = computeConsumption({
      telemetry: [],
      purchases: [{ at: min(1), liters: 1240 }],
      from: min(0),
      to: min(10),
      routeEstimateKm: 4000,
    });
    expect(est).toMatchObject({ method: "PURCHASES", distanceSource: "ROUTE_ESTIMATE", per100Km: 31 });
  });
});

describe("Лимиты топливной карты", () => {
  const limits: FuelCardLimits = {
    perTransactionLiters: 300,
    dailyLiters: 600,
    monthlyLiters: 5000,
    dailyAmount: 100_000,
    monthlyAmount: null,
    allowedFuelTypes: ["DIESEL"],
    allowedStationBrands: [],
    allowedStationIds: [],
    allowedRegions: ["KZ", "RU"],
    allowedFromMinute: 6 * 60,
    allowedToMinute: 23 * 60,
    timezone: "Asia/Almaty",
  };
  const card = { status: "ACTIVE" as const, expiresAt: null };
  const usage = { dayLiters: 0, monthLiters: 0, dayAmount: 0, monthAmount: 0 };
  const req = { liters: 250, amount: 70_000, fuelType: "DIESEL" as const, stationCountry: "KZ", at: T };
  const codes = (r: ReturnType<typeof checkFuelPurchase>) => r.violations.map((v) => v.code);

  it("в пределах лимитов — разрешено", () => {
    expect(checkFuelPurchase(card, limits, req, usage, { available: 2_500_000 })).toEqual({ allowed: true, violations: [] });
  });
  it("лимит на заправку, дневной, месячный, сумма", () => {
    expect(codes(checkFuelPurchase(card, limits, { ...req, liters: 301 }, usage, { available: 1e9 }))).toEqual(["PER_TRANSACTION_LITERS"]);
    expect(codes(checkFuelPurchase(card, limits, req, { ...usage, dayLiters: 400 }, { available: 1e9 }))).toEqual(["DAILY_LITERS"]);
    expect(codes(checkFuelPurchase(card, limits, req, { ...usage, monthLiters: 4900 }, { available: 1e9 }))).toEqual(["MONTHLY_LITERS"]);
    expect(codes(checkFuelPurchase(card, limits, req, { ...usage, dayAmount: 40_000 }, { available: 1e9 }))).toEqual(["DAILY_AMOUNT"]);
  });
  it("тип топлива, регион, АЗС, время", () => {
    expect(codes(checkFuelPurchase(card, limits, { ...req, fuelType: "PETROL" }, usage, { available: 1e9 }))).toEqual([
      "FUEL_TYPE_NOT_ALLOWED",
    ]);
    expect(codes(checkFuelPurchase(card, limits, { ...req, stationCountry: "CN" }, usage, { available: 1e9 }))).toEqual([
      "REGION_NOT_ALLOWED",
    ]);
    expect(
      codes(
        checkFuelPurchase(card, { ...limits, allowedStationBrands: ["Helios"] }, { ...req, stationBrand: "Sinooil" }, usage, {
          available: 1e9,
        }),
      ),
    ).toEqual(["STATION_NOT_ALLOWED"]);
    const night = new Date("2026-10-01T19:30:00Z"); // 01:30 Алматы
    expect(codes(checkFuelPurchase(card, limits, { ...req, at: night }, usage, { available: 1e9 }))).toEqual(["TIME_NOT_ALLOWED"]);
    expect(inTimeWindow(30, 22 * 60, 6 * 60)).toBe(true); // окно через полночь
  });
  it("заблокированная или просроченная карта не используется", () => {
    expect(codes(checkFuelPurchase({ status: "BLOCKED", expiresAt: null }, limits, req, usage, { available: 1e9 }))).toEqual([
      "CARD_NOT_ACTIVE",
    ]);
    expect(
      codes(checkFuelPurchase({ status: "ACTIVE", expiresAt: new Date("2026-01-01") }, limits, req, usage, { available: 1e9 })),
    ).toEqual(["CARD_EXPIRED"]);
  });
  it("нехватка средств: водителю не раскрывается баланс компании", () => {
    const r = checkFuelPurchase(card, limits, req, usage, { available: 10_000 });
    expect(codes(r)).toEqual(["INSUFFICIENT_FUNDS"]);
    expect(r.violations[0].driverMessage).toBe("Оплата не разрешена. Обратитесь к диспетчеру.");
    expect(r.violations[0].driverMessage).not.toMatch(/\d/);
  });
  it("остаток лимита для водителя и границы периодов в поясе карты", () => {
    expect(remainingLiters(limits, { ...usage, dayLiters: 450 })).toMatchObject({ day: 150, nowMax: 150 });
    const { dayStart, monthStart } = periodStarts(new Date("2026-10-01T20:00:00Z"), "Asia/Almaty"); // 02:00 2 октября в Алматы
    expect(dayStart.toISOString()).toBe("2026-10-01T19:00:00.000Z");
    expect(monthStart.toISOString()).toBe("2026-09-30T19:00:00.000Z");
  });
});

describe("State machine топливной транзакции", () => {
  it("разрешённые и запрещённые переходы; завершённые не меняются", () => {
    expect(canFuelTxTransition("PENDING", "AUTHORIZED").ok).toBe(true);
    expect(canFuelTxTransition("AUTHORIZED", "COMPLETED").ok).toBe(true);
    expect(canFuelTxTransition("COMPLETED", "REFUNDED").ok).toBe(true);
    expect(canFuelTxTransition("COMPLETED", "AUTHORIZED").ok).toBe(false);
    expect(canFuelTxTransition("COMPLETED", "REVERSED").ok).toBe(false);
    expect(canFuelTxTransition("REFUNDED", "COMPLETED").ok).toBe(false);
    expect(canFuelTxTransition("DECLINED", "AUTHORIZED").ok).toBe(false);
  });
});
