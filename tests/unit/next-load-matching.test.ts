import { describe, expect, it } from "vitest";
import { haversineKm, projectOnSegment } from "@/lib/geo/distance";
import { bodyCompatible, matchNextLoads, type MatchCandidate, type MatchParams } from "@/lib/next-load/matching";

const CITY = {
  almaty: { lat: 43.2389, lng: 76.8897, city: "Алматы", country: "KZ" },
  astana: { lat: 51.1694, lng: 71.4491, city: "Астана", country: "KZ" },
  moscow: { lat: 55.7558, lng: 37.6173, city: "Москва", country: "RU" },
  chelyabinsk: { lat: 55.1644, lng: 61.4368, city: "Челябинск", country: "RU" },
  bishkek: { lat: 42.8746, lng: 74.5698, city: "Бишкек", country: "KG" },
  kostanay: { lat: 53.2198, lng: 63.6354, city: "Костанай", country: "KZ" },
  urumqi: { lat: 43.8256, lng: 87.6168, city: "Урумчи", country: "CN" },
};
type CityKey = keyof typeof CITY;

const NOW = new Date("2026-10-01T06:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400_000);

let seq = 0;
function load(from: CityKey, to: CityKey, over: Partial<MatchCandidate> = {}): MatchCandidate {
  seq += 1;
  return {
    id: `${from}-${to}-${seq}`,
    pickup: CITY[from],
    delivery: CITY[to],
    weightKg: 15000,
    volumeM3: 60,
    bodyType: "CURTAINSIDER",
    requiresGps: false,
    loadingDateFrom: day(1),
    loadingDateTo: day(3),
    targetPrice: 2000,
    currency: "USD",
    ...over,
  };
}

const vehicle = { bodyType: "CURTAINSIDER" as const, capacityKg: 20000, volumeM3: 86, gpsEnabled: true };

function params(destinations: CityKey[], over: Partial<MatchParams> = {}): MatchParams {
  return {
    origin: { ...CITY.almaty, label: "Алматы" },
    destinations: destinations.map((d) => ({ ...CITY[d], label: CITY[d].city })),
    allowedDeviationKm: 250,
    maxPickupDistanceKm: 300,
    availableFrom: NOW,
    availableUntil: day(7),
    vehicle,
    now: NOW,
    ...over,
  };
}

/** Демо-набор из ТЗ: грузы после доставки Китай → Алматы. */
const DEMO = () => [
  load("almaty", "astana"),
  load("almaty", "moscow"),
  load("almaty", "chelyabinsk"),
  load("almaty", "bishkek"),
  load("astana", "moscow"),
  load("kostanay", "moscow"),
];

const ids = (r: ReturnType<typeof matchNextLoads>) => r.matches.map((m) => m.loadId.replace(/-\d+$/, ""));

describe("geo", () => {
  it("расстояние Алматы — Астана ≈ 970 км по прямой", () => {
    expect(Math.round(haversineKm(CITY.almaty, CITY.astana) / 10) * 10).toBe(970);
  });
  it("проекция на отрезок: точка на линии имеет нулевое отклонение", () => {
    const mid = { lat: (CITY.almaty.lat + CITY.astana.lat) / 2, lng: (CITY.almaty.lng + CITY.astana.lng) / 2 };
    const p = projectOnSegment(mid, CITY.almaty, CITY.astana);
    // середина в координатах не лежит точно на дуге большого круга — допускаем небольшое расхождение
    expect(p.distanceKm).toBeLessThan(30);
    expect(p.alongKm).toBeGreaterThan(400);
  });
});

describe("Next Load: подбор следующего груза", () => {
  it("поиск рядом с текущей точкой (направление не выбрано): только погрузка в радиусе", () => {
    const r = matchNextLoads(params([]), DEMO());
    expect(ids(r).sort()).toEqual(["almaty-astana", "almaty-bishkek", "almaty-chelyabinsk", "almaty-moscow"]);
    expect(r.matches.every((m) => m.directionMatch === "ANY" && m.pickupDistanceKm === 0)).toBe(true);
    expect(r.rejected.find((x) => x.loadId.startsWith("astana-moscow"))?.reasons[0]).toMatch(/дальше радиуса/);
  });

  it("по направлению Москва: грузы по коридору, включая погрузку по пути (Астана → Москва, Костанай → Москва)", () => {
    const r = matchNextLoads(params(["moscow"]), DEMO());
    const got = ids(r);
    expect(got).toEqual(
      expect.arrayContaining(["almaty-moscow", "almaty-astana", "almaty-chelyabinsk", "astana-moscow", "kostanay-moscow"]),
    );
    const direct = r.matches.find((m) => m.loadId.startsWith("almaty-moscow"))!;
    expect(direct.detourKm).toBe(0);
    expect(direct.directionScore).toBe(1);
    expect(direct.remainingToDestinationKm).toBe(0);
    // Прямой груз в Москву — первый: нет пустого пробега и крюка
    expect(r.matches[0].loadId.startsWith("almaty-moscow")).toBe(true);
    const viaAstana = r.matches.find((m) => m.loadId.startsWith("astana-moscow"))!;
    expect(viaAstana.estimatedEmptyDistanceKm).toBeGreaterThan(1000);
    expect(viaAstana.matchReason.join(" ")).toMatch(/Погрузка в Астана/);
  });

  it("по направлению Астана: грузы в Москву/Челябинск и «в сторону» (Бишкек) исключаются", () => {
    const r = matchNextLoads(params(["astana"]), DEMO());
    expect(ids(r)).toEqual(["almaty-astana"]);
    const moscow = r.rejected.find((x) => x.loadId.startsWith("almaty-moscow"))!;
    expect(moscow.reasons.join(" ")).toMatch(/крюк/);
    const bishkek = r.rejected.find((x) => x.loadId.startsWith("almaty-bishkek"))!;
    expect(bishkek.reasons.join(" ")).toMatch(/в сторону от направления/);
  });

  it("возврат в Китай: грузы в обратную сторону исключаются", () => {
    const r = matchNextLoads(params(["urumqi"]), [...DEMO(), load("almaty", "urumqi")]);
    expect(ids(r)).toEqual(["almaty-urumqi"]);
  });

  it("допустимое отклонение: при уменьшении крюка грузы по пути отсекаются", () => {
    const wide = matchNextLoads(params(["moscow"], { allowedDeviationKm: 250 }), [load("astana", "chelyabinsk")]);
    expect(wide.matches).toHaveLength(1);
    const narrow = matchNextLoads(params(["moscow"], { allowedDeviationKm: 50 }), [load("astana", "chelyabinsk")]);
    expect(narrow.matches).toHaveLength(0);
    expect(narrow.rejected[0].reasons.join(" ")).toMatch(/допустимо 50 км/);
  });

  it("несколько направлений: груз подходит, если он по пути хотя бы в одно из них", () => {
    const r = matchNextLoads(params(["astana", "chelyabinsk"]), DEMO());
    const got = ids(r);
    expect(got).toContain("almaty-astana");
    expect(got).toContain("almaty-chelyabinsk");
    expect(got).not.toContain("almaty-moscow");
    const chel = r.matches.find((m) => m.loadId.startsWith("almaty-chelyabinsk"))!;
    expect(chel.destinationLabel).toBe("Челябинск");
  });

  it("несовместимый тип кузова исключается (рефрижератор может везти изотерм)", () => {
    const r = matchNextLoads(params([]), [load("almaty", "astana", { bodyType: "REFRIGERATOR" })]);
    expect(r.matches).toHaveLength(0);
    expect(r.rejected[0].reasons[0]).toMatch(/Нужен кузов «рефрижератор»/);
    expect(bodyCompatible("ISOTHERMAL", "REFRIGERATOR")).toBe(true);
    expect(bodyCompatible("REFRIGERATOR", "ISOTHERMAL")).toBe(false);
    expect(bodyCompatible(null, "FLATBED")).toBe(true);
  });

  it("недостаточная грузоподъёмность и отсутствие GPS", () => {
    const r = matchNextLoads(params([]), [load("almaty", "astana", { weightKg: 24000 }), load("almaty", "astana", { requiresGps: true })]);
    expect(r.matches).toHaveLength(1);
    expect(r.rejected[0].reasons[0]).toMatch(/Недостаточная грузоподъёмность: груз 24 т, автомобиль 20 т/);
    const noGps = matchNextLoads(params([], { vehicle: { ...vehicle, gpsEnabled: false } }), [
      load("almaty", "astana", { requiresGps: true }),
    ]);
    expect(noGps.rejected[0].reasons[0]).toMatch(/GPS/);
  });

  it("неподходящая дата: окно погрузки прошло, не успевает или погрузка позже периода доступности", () => {
    const r = matchNextLoads(params(["moscow"]), [
      load("almaty", "moscow", { loadingDateFrom: day(-5), loadingDateTo: day(-3) }),
      load("kostanay", "moscow", { loadingDateFrom: NOW, loadingDateTo: day(1) }),
      load("almaty", "moscow", { loadingDateFrom: day(20), loadingDateTo: day(21) }),
    ]);
    expect(r.matches).toHaveLength(0);
    const reasons = r.rejected.map((x) => x.reasons.join(" "));
    expect(reasons[0]).toMatch(/Окно погрузки уже прошло/);
    expect(reasons[1]).toMatch(/Не успеваете к погрузке/);
    expect(reasons[2]).toMatch(/позже периода доступности/);
  });

  it("нет подходящих грузов → пустой список и причины по каждому грузу", () => {
    const r = matchNextLoads(params(["urumqi"]), DEMO());
    expect(r.matches).toEqual([]);
    expect(r.rejected).toHaveLength(6);
    expect(r.rejected.every((x) => x.reasons.length > 0)).toBe(true);
  });

  it("груз без координат не подбирается", () => {
    const r = matchNextLoads(params([]), [load("almaty", "astana", { pickup: null })]);
    expect(r.rejected[0].reasons).toEqual(["Нет координат точек погрузки/выгрузки"]);
  });

  it("сортировки: ставка за км и дата погрузки", () => {
    const cheap = load("almaty", "astana", { targetPrice: 500, loadingDateFrom: day(2), loadingDateTo: day(4) });
    const rich = load("almaty", "chelyabinsk", { targetPrice: 5000, loadingDateFrom: day(1) });
    const byRate = matchNextLoads(params([]), [cheap, rich], "rate");
    expect(byRate.matches[0].loadId).toBe(rich.id);
    expect(byRate.matches[0].ratePerKm).toBeGreaterThan(byRate.matches[1].ratePerKm!);
    const byDate = matchNextLoads(params([]), [cheap, rich], "date");
    expect(byDate.matches[0].loadId).toBe(rich.id);
  });

  it("без автомобиля — подбор с предупреждением о проверке совместимости", () => {
    const r = matchNextLoads(params([], { vehicle: null }), [load("almaty", "astana", { weightKg: 40000 })]);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].compatibility.warnings[0]).toMatch(/Автомобиль не выбран/);
  });
});
