/**
 * Демо-сценарий Fleet Fuel Control (все данные помечены как DEMO).
 *
 * ABC Logistics · MAN TGX 123ABC · водитель Ivan · рейс Алматы → Москва · карта FC-001 (300 л на заправку) · норма 31 л/100 км.
 * Телематика (CAN: GPS, одометр, двигатель, уровень топлива, счётчик расхода) симулируется по маршруту с расходом 31,4 л/100 км.
 *
 * Заправки (всего 4, 850 л):
 *   1) Helios, Алматы — 250 л — MATCHED (GPS у АЗС, уровень вырос на 250 л)
 *   2) Sinooil, Шымкент — 300 л — MATCHED
 *   3) АЗС по пути (Актюбинская обл.) — 150 л — FUEL_LEVEL_MISMATCH (уровень вырос только на 30 л)
 *   4) «Неизвестная АЗС» — 150 л — LOCATION_MISMATCH (GPS автомобиля в ~84 км; уровень в этот период не передавался)
 * Текущий уровень — 487 л из 1 000 л.
 */
import type { Actor } from "@/lib/auth/actor";
import { buildActor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { haversineKm, ROAD_FACTOR } from "@/lib/geo/distance";
import type { LoadInput } from "@/lib/validation/load";
import { loadInputSchema } from "@/lib/validation/load";
import { acceptBid, createBid } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import { issueFuelCard, topUpAccount, updateVehicleFuelSettings } from "@/server/services/fuel-card.service";
import { recordFromOwner } from "@/server/services/fuel-transaction.service";
import { createLoad } from "@/server/services/load.service";
import { assignDriver, assignVehicle, changeStatus } from "@/server/services/order.service";
import { ingestTelemetry } from "@/server/services/telemetry.service";

type Ctx = {
  shipper: Actor;
  password: string;
  createUser: (email: string, firstName: string, lastName: string, phone: string) => Promise<{ id: string }>;
  shiftOrderToPast: (orderId: string, days: number) => Promise<void>;
  meta: { ip: string; userAgent: string };
};

const HOUR = 3_600_000;
const RATE = 0.314; // л/км — 31,4 л/100 км

// Маршрут рейса (совпадает с точками груза): Алматы → Шымкент → Актобе → Москва
const ROUTE = [
  { city: "Алматы", country: "KZ", lat: 43.2389, lng: 76.8897 },
  { city: "Шымкент", country: "KZ", lat: 42.3417, lng: 69.5901 },
  { city: "Актобе", country: "KZ", lat: 50.2839, lng: 57.167 },
  { city: "Москва", country: "RU", lat: 55.7558, lng: 37.6173 },
];
const SEG_KM = ROUTE.slice(1).map((p, i) => haversineKm(ROUTE[i], p) * ROAD_FACTOR);

/** Промежуточная точка на дуге большого круга между a и b (f от 0 до 1). */
function slerp(a: { lat: number; lng: number }, b: { lat: number; lng: number }, f: number) {
  const r = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a.lat * r, a.lng * r, b.lat * r, b.lng * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d === 0) return { lat: a.lat, lng: a.lng };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / r, lng: Math.atan2(y, x) / r };
}

/** Точка на маршруте по дорожному километражу. */
function pointAt(km: number) {
  let rest = Math.max(0, km);
  for (let i = 0; i < SEG_KM.length; i++) {
    if (rest <= SEG_KM[i] || i === SEG_KM.length - 1) return slerp(ROUTE[i], ROUTE[i + 1], Math.min(1, rest / SEG_KM[i]));
    rest -= SEG_KM[i];
  }
  return ROUTE[ROUTE.length - 1];
}

export async function seedFuelDemo(ctx: Ctx) {
  const uOwner = await ctx.createUser("fleet@cargoflow.demo", "Азамат", "Абенов", "+7 701 100 00 01");
  const uIvan = await ctx.createUser("ivan@cargoflow.demo", "Ivan", "Petrov", "+7 701 100 00 02");
  const abc = await prisma.company.create({
    data: {
      type: "CARRIER",
      legalName: "ABC Logistics",
      registrationNumber: "DEMO-KZ-000077",
      taxId: "000000000077",
      country: "KZ",
      city: "Алматы",
      address: "ул. Демонстрационная, 77",
      phone: "+7 727 100 00 77",
      email: "office@abc-logistics.demo",
      verificationStatus: "VERIFIED",
    },
  });
  await prisma.companyMember.createMany({
    data: [
      { companyId: abc.id, userId: uOwner.id, role: "CARRIER_ADMIN" },
      { companyId: abc.id, userId: uIvan.id, role: "DRIVER" },
    ],
  });
  const owner = await buildActor(uOwner.id, { activeCompanyId: abc.id, meta: ctx.meta });
  const ivanActor = await buildActor(uIvan.id, { activeCompanyId: abc.id, meta: ctx.meta });

  const man = await prisma.vehicle.create({
    data: {
      companyId: abc.id,
      plateNumber: "123ABC",
      country: "KZ",
      make: "MAN",
      model: "TGX",
      year: 2022,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 22000,
      volumeM3: 86,
      vin: "DEMOMANTGX0000123",
      gpsEnabled: true,
    },
  });
  await updateVehicleFuelSettings(owner, man.id, {
    fuelType: "DIESEL",
    engineType: "MAN D26, Euro 6",
    tankCapacityLiters: 1000,
    fuelNormPer100Km: 31,
    telematicsProvider: "demo",
    telematicsDeviceId: "DEMO-CAN-123ABC",
  });
  // Второй автомобиль без телематики: система честно показывает «нет данных»
  const volvo = await prisma.vehicle.create({
    data: {
      companyId: abc.id,
      plateNumber: "456ABC",
      country: "KZ",
      make: "Volvo",
      model: "FH",
      year: 2019,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 20000,
      volumeM3: 82,
    },
  });
  await updateVehicleFuelSettings(owner, volvo.id, {
    fuelType: "DIESEL",
    engineType: "Volvo D13",
    tankCapacityLiters: 900,
    fuelNormPer100Km: 32,
    telematicsProvider: null,
    telematicsDeviceId: null,
  });
  const ivan = await prisma.driverProfile.create({
    data: {
      userId: uIvan.id,
      companyId: abc.id,
      fullName: "Ivan Petrov",
      phone: "+7 701 100 00 02",
      licenseNumber: "DEMO-DL-0777",
      licenseCategory: "CE",
    },
  });

  // ── Рейс Алматы → Москва ──
  const stops: LoadInput["stops"] = ROUTE.map((p, i) => ({
    type: i === 0 ? "PICKUP" : i === ROUTE.length - 1 ? "DELIVERY" : "TRANSIT",
    country: p.country,
    city: p.city,
    plannedDateFrom: new Date(Date.now() + (1 + i * 2) * 24 * HOUR).toISOString(),
  }));
  const load = await createLoad(
    ctx.shipper,
    loadInputSchema.parse({
      title: "Оборудование: Алматы — Москва",
      cargoType: "EQUIPMENT",
      weightKg: 18000,
      priceType: "NEGOTIABLE",
      targetPrice: 4800,
      currency: "USD",
      bodyType: "CURTAINSIDER",
      stops,
    }),
    { publish: true },
  );
  const bid = await createBid(owner, load.id, {
    amount: 4700,
    currency: "USD",
    comment: "MAN TGX, GPS/CAN",
    readyDate: null,
    terms: null,
    validUntil: null,
  });
  const { orderId, contractId } = await acceptBid(ctx.shipper, bid.id);
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  await signContract(ctx.shipper, contractId, { password: ctx.password, documentHash: contract.contentHash });
  await signContract(owner, contractId, { password: ctx.password, documentHash: contract.contentHash });
  await assignVehicle(owner, orderId, man.id);
  await assignDriver(owner, orderId, ivan.id);
  for (const status of ["AT_LOADING", "LOADED", "IN_TRANSIT"] as const) {
    await changeStatus(ivanActor, orderId, {
      status,
      comment: null,
      documentIds: [],
      latitude: ROUTE[0].lat,
      longitude: ROUTE[0].lng,
      accuracy: 20,
    });
  }
  await ctx.shiftOrderToPast(orderId, 2);

  // ── Топливный счёт и карта ──
  await topUpAccount(owner, { amount: 2_500_000, currency: "KZT", reference: "Демо-пополнение №1", note: null }, "seed-topup-1");
  const card = await issueFuelCard(owner, {
    label: "FC-001",
    currency: "KZT",
    vehicleId: man.id,
    driverId: ivan.id,
    perTransactionLiters: 300,
    dailyLiters: 900,
    monthlyLiters: 5000,
    dailyAmount: null,
    monthlyAmount: null,
    allowedFuelTypes: ["DIESEL"],
    allowedStationBrands: [],
    allowedStationIds: [],
    allowedRegions: ["KZ", "RU"],
    allowedFromMinute: null,
    allowedToMinute: null,
    driverCanSeeFuelLevel: true,
  });

  // ── Телематика по маршруту: движение 60 км/ч, остановки на заправках ──
  const now = Date.now();
  const start = now - 40 * HOUR;
  const events = [
    { km: 0, liters: 250, added: 250, station: "Helios №12, Алматы", brand: "Helios", country: "KZ", offsetKm: 0, levelGap: false },
    { km: SEG_KM[0], liters: 300, added: 300, station: "Sinooil, Шымкент", brand: "Sinooil", country: "KZ", offsetKm: 0, levelGap: false },
    {
      km: 1400,
      liters: 150,
      added: 30,
      station: "АЗС «Трасса» (Актюбинская обл.)",
      brand: "Трасса",
      country: "KZ",
      offsetKm: 0,
      levelGap: false,
    },
    { km: 1900, liters: 150, added: 0, station: "Неизвестная АЗС", brand: "—", country: "KZ", offsetKm: -101, levelGap: true },
  ];
  const endKm = 2300;
  const level0 = 487 + endKm * RATE - events.reduce((a, e) => a + e.added, 0);
  const odo0 = 120_000;
  const kmAt = (t: number) => Math.min(endKm, Math.max(0, ((t - start) / HOUR) * (endKm / 40)));
  const timeAt = (km: number) => start + (km / endKm) * 40 * HOUR;
  // Уровень в момент t: начальный − расход по пройденному пути + всё, что залито до t
  const levelAt = (t: number) => level0 - kmAt(t) * RATE + events.filter((e) => timeAt(e.km) < t).reduce((a, e) => a + e.added, 0);
  const readings: Parameters<typeof ingestTelemetry>[0]["readings"] = [];
  const gapWindows = events.filter((e) => e.levelGap).map((e) => [timeAt(e.km) - 150 * 60_000, timeAt(e.km) + 150 * 60_000]);
  for (let t = start - 20 * 60_000; t <= now; t += 20 * 60_000) {
    const km = kmAt(t);
    if (events.some((e) => Math.abs(timeAt(e.km) - t) < 15 * 60_000)) continue; // рядом с заправкой — отдельные точки
    const p = pointAt(km);
    const inGap = gapWindows.some(([a, b]) => t >= a && t <= b);
    readings.push({
      recordedAt: new Date(t),
      latitude: p.lat,
      longitude: p.lng,
      speedKmh: km > 0 && km < endKm ? 60 : 0,
      heading: null,
      engineOn: km > 0 && km < endKm,
      odometerKm: odo0 + km,
      fuelLevelLiters: inGap ? null : Math.round(levelAt(t) * 10) / 10,
      fuelLevelSource: inGap ? null : "CAN_J1939",
      fuelUsedTotalL: 50_000 + km * RATE,
    });
  }
  for (const e of events) {
    const t = timeAt(e.km);
    const p = pointAt(e.km);
    for (const dt of [-10, 10]) {
      readings.push({
        recordedAt: new Date(t + dt * 60_000),
        latitude: p.lat,
        longitude: p.lng,
        speedKmh: 0,
        heading: null,
        engineOn: false,
        odometerKm: odo0 + e.km,
        fuelLevelLiters: e.levelGap ? null : Math.round(levelAt(t + dt * 60_000) * 10) / 10,
        fuelLevelSource: e.levelGap ? null : "CAN_J1939",
        fuelUsedTotalL: 50_000 + e.km * RATE,
      });
    }
  }
  await ingestTelemetry({ vehicleId: man.id, source: "DEMO", provider: "demo", readings, isDemo: true });

  // ── Заправки по карте (после показаний — сопоставление выполняется сразу) ──
  for (const e of events) {
    const at = timeAt(e.km);
    // «Неизвестная АЗС» — в ~84 км (по прямой) позади по маршруту от реальной позиции автомобиля
    const station = pointAt(e.km + e.offsetKm);
    await recordFromOwner(owner, {
      fuelCardId: card.id,
      stationName: e.station,
      stationBrand: e.brand,
      stationId: null,
      stationAddress: null,
      stationCountry: e.country,
      latitude: station.lat,
      longitude: station.lng,
      fuelType: "DIESEL",
      liters: e.liters,
      pricePerLiter: 320,
      transactionDate: new Date(at),
    });
  }
  return { companyId: abc.id, orderId };
}
