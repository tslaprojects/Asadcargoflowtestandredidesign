/**
 * Детерминированный генератор демо-мира CargoFlow (≈100 грузов, 20 машин, 20 водителей, 16 перевозчиков, 40 клиентов).
 *
 * Запускается внутри runWithDataMode("demo") после сценариев prisma/seed.ts — пишет только в демо-базу.
 * Одинаковый seed → одинаковые компании, люди, маршруты, суммы и идентификаторы; даты строятся относительно
 * базовой даты (DEMO_SEED_DATE или «сейчас»), чтобы dashboard, фильтры и «ближайшие перевозки» были живыми.
 * Связность: клиент → груз → ставка → перевозка → перевозчик → машина → водитель → маршрут → трекинг → документы → уведомления.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Prisma } from "@/generated/prisma/client";
import type { Currency, LoadStatus, NotificationType, OrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { roadKm } from "@/lib/geo/distance";
import { storage } from "@/lib/storage/storage";
import { estimatedRouteFields } from "@/server/geo/load-route";
import { createContractInTx } from "@/server/services/contract.service";
import { DEMO_ANCHORS } from "@/server/services/demo-workspace.service";
import {
  BORDERS,
  CARGO,
  CARRIER_NAMES,
  CITIES,
  clientNames,
  FIRST_NAMES,
  LAST_NAMES,
  OFFICE_NAMES,
  ROUTES,
  VEHICLES,
  type City,
} from "./catalog";

// ───────── Детерминированная случайность ─────────

function hashSeed(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof makeRng>;

export function makeRng(seed: string) {
  const next = mulberry32(hashSeed(seed));
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    float: (min: number, max: number) => min + next() * (max - min),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    index: (n: number) => Math.floor(next() * n),
    chance: (p: number) => next() < p,
    /** UUID v4 из того же потока — идентификаторы воспроизводимы. */
    uuid: () => {
      const b = Array.from({ length: 16 }, () => Math.floor(next() * 256));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  };
}

// ───────── План статусов ─────────

type OrderPlan = { kind: "order"; status: OrderStatus; delayed?: boolean; afterBorder?: boolean; cancelAfter?: OrderStatus };
type LoadPlan = { kind: "load"; status: Extract<LoadStatus, "DRAFT" | "PUBLISHED" | "BIDDING" | "CANCELLED"> };
type Plan = (OrderPlan | LoadPlan) & { urgent?: boolean; size?: "large" | "small" };

const rep = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

/** Распределение: не все «доставлено» — новые, ожидающие перевозчика, в пути, на границе, задержанные, закрытые, отменённые. */
function buildPlan(): Plan[] {
  return [
    ...rep(5, () => ({ kind: "load", status: "DRAFT" }) as Plan),
    ...rep(8, (i) => ({ kind: "load", status: "PUBLISHED", urgent: i === 0, size: i === 1 ? "small" : undefined }) as Plan),
    ...rep(10, (i) => ({ kind: "load", status: "BIDDING", size: i === 0 ? "large" : undefined }) as Plan),
    ...rep(3, () => ({ kind: "load", status: "CANCELLED" }) as Plan),
    ...rep(3, () => ({ kind: "order", status: "CARRIER_SELECTED" }) as Plan),
    ...rep(3, () => ({ kind: "order", status: "CONTRACT_PENDING" }) as Plan),
    ...rep(3, (i) => ({ kind: "order", status: "CONTRACT_SIGNED", urgent: i === 0 }) as Plan),
    { kind: "order", status: "VEHICLE_ASSIGNED" },
    { kind: "order", status: "DRIVER_ASSIGNED" },
    ...rep(2, () => ({ kind: "order", status: "WAITING_FOR_LOADING" }) as Plan),
    ...rep(2, () => ({ kind: "order", status: "AT_LOADING" }) as Plan),
    { kind: "order", status: "LOADED", size: "large" },
    ...rep(6, (i) => ({ kind: "order", status: "IN_TRANSIT", delayed: i < 2, afterBorder: i === 2 || i === 3 }) as Plan),
    ...rep(2, () => ({ kind: "order", status: "AT_BORDER" }) as Plan),
    { kind: "order", status: "CUSTOMS" },
    { kind: "order", status: "AT_DELIVERY" },
    ...rep(7, () => ({ kind: "order", status: "DELIVERED" }) as Plan),
    ...rep(26, (i) => ({ kind: "order", status: "CLOSED", size: i === 5 ? "small" : undefined }) as Plan),
    ...rep(
      4,
      (i) =>
        ({
          kind: "order",
          status: "CANCELLED",
          cancelAfter: (["CONTRACT_PENDING", "VEHICLE_ASSIGNED", "CONTRACT_SIGNED", "CARRIER_SELECTED"] as const)[i],
        }) as Plan,
    ),
  ];
}

const ACTIVE: OrderStatus[] = [
  "VEHICLE_ASSIGNED",
  "DRIVER_ASSIGNED",
  "WAITING_FOR_LOADING",
  "AT_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CUSTOMS",
  "BORDER_CLEARED",
  "AT_DELIVERY",
];

// ───────── Расписание перевозки (дни относительно даты загрузки L) ─────────

type Step = { status: OrderStatus; at: number };

function schedule(days: number, border: boolean): Step[] {
  const steps: Step[] = [
    { status: "CARRIER_SELECTED", at: -6 },
    { status: "CONTRACT_PENDING", at: -5.9 },
    { status: "CONTRACT_SIGNED", at: -5 },
    { status: "VEHICLE_ASSIGNED", at: -4 },
    { status: "DRIVER_ASSIGNED", at: -3.9 },
    { status: "WAITING_FOR_LOADING", at: -1 },
    { status: "AT_LOADING", at: 0 },
    { status: "LOADED", at: 0.25 },
    { status: "IN_TRANSIT", at: 0.35 },
  ];
  if (border) {
    const b = 0.35 + days * 0.45;
    steps.push(
      { status: "AT_BORDER", at: b },
      { status: "CUSTOMS", at: b + 0.15 },
      { status: "BORDER_CLEARED", at: b + 0.35 },
      { status: "IN_TRANSIT", at: b + 0.4 },
    );
  }
  steps.push({ status: "AT_DELIVERY", at: days }, { status: "DELIVERED", at: days + 0.2 }, { status: "CLOSED", at: days + 1.5 });
  return steps;
}

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

function lerp(a: City, b: City, t: number) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Простой PDF-заполнитель: только метаданные демо-документа, не реальный документ. */
async function placeholderPdf(title: string, number: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("CargoFlow DEMO DOCUMENT", { x: 50, y: 780, size: 20, font });
  page.drawText(`${title} - ${number}`, { x: 50, y: 750, size: 12, font });
  page.drawText("Synthetic demo placeholder. Not a real transport document.", { x: 50, y: 725, size: 10, font });
  return Buffer.from(await pdf.save());
}

export type DemoWorldSummary = Record<string, number>;

export async function generateDemoWorld(opts: { seed?: string; now?: Date } = {}): Promise<DemoWorldSummary> {
  const r = makeRng(opts.seed ?? "cargoflow-demo");
  const now = opts.now ?? new Date();
  const passwordHash = "!demo-persona:identity-in-real-db";

  // ───────── Ключевые демо-компании из сценариев ─────────
  const anchors = await prisma.company.findMany({
    where: { registrationNumber: { in: Object.values(DEMO_ANCHORS) } },
    include: { members: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } } },
  });
  const anchor = (reg: string) => {
    const c = anchors.find((a) => a.registrationNumber === reg);
    if (!c) throw new Error(`Нет ключевой демо-компании ${reg}: сначала выполните сценарии seed.`);
    return c;
  };
  const aShipper = anchor(DEMO_ANCHORS.SHIPPER);
  const aCarrier = anchor(DEMO_ANCHORS.CARRIER);
  const aForwarder = anchor(DEMO_ANCHORS.FORWARDER);
  const memberOf = (c: typeof aShipper, role: string) => c.members.find((m) => m.role === role)?.userId ?? c.members[0]!.userId;

  // ───────── Компании, пользователи ─────────
  const companies: Prisma.CompanyCreateManyInput[] = [];
  const users: Prisma.UserCreateManyInput[] = [];
  const members: Prisma.CompanyMemberCreateManyInput[] = [];
  const person = () => ({ firstName: r.pick(FIRST_NAMES), lastName: r.pick(LAST_NAMES) });
  const phone = () =>
    `+7 70${r.int(0, 9)} ${r.int(100, 999)} ${String(r.int(0, 99)).padStart(2, "0")} ${String(r.int(0, 99)).padStart(2, "0")}`;
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const clientList = clientNames((n) => r.index(n)).map((name, i) => {
    const id = r.uuid();
    const city = r.pick(["Алматы", "Астана", "Шымкент", "Караганда", "Ташкент", "Бишкек", "Павлодар", "Актобе"]);
    companies.push({
      id,
      type: "SHIPPER",
      legalName: `ТОО «${name}»`,
      tradeName: name,
      registrationNumber: `DEMO-CL-${String(i + 1).padStart(4, "0")}`,
      taxId: String(100000000000 + i * 7919),
      country: CITIES[city].country,
      city,
      address: `ул. Демонстрационная, ${r.int(1, 200)}`,
      phone: phone(),
      email: `office@${slug(name)}.demo`,
      verificationStatus: r.chance(0.85) ? "VERIFIED" : "PENDING",
      description: "Вымышленная компания демо-среды CargoFlow.",
      createdAt: addDays(now, -r.int(60, 400)),
    });
    const uid = r.uuid();
    users.push({
      id: uid,
      email: `${slug(name)}@clients.cargoflow.demo`,
      passwordHash,
      firstName: r.pick(OFFICE_NAMES),
      lastName: r.pick(LAST_NAMES),
      phone: phone(),
    });
    members.push({ companyId: id, userId: uid, role: "SHIPPER" });
    return { id, name, userId: uid };
  });

  const carrierList = CARRIER_NAMES.map((name, i) => {
    const id = r.uuid();
    const city = r.pick(["Алматы", "Астана", "Шымкент", "Костанай", "Актобе", "Бишкек", "Ташкент"]);
    companies.push({
      id,
      type: "CARRIER",
      legalName: `ТОО «${name}»`,
      tradeName: name,
      registrationNumber: `DEMO-CR-${String(i + 1).padStart(4, "0")}`,
      taxId: String(200000000000 + i * 104729),
      country: CITIES[city].country,
      city,
      address: `Промзона, участок ${r.int(1, 90)}`,
      phone: phone(),
      email: `dispatch@${slug(name)}.demo`,
      verificationStatus: i < 13 ? "VERIFIED" : i === 13 ? "PENDING" : "UNVERIFIED",
      description: "Вымышленный перевозчик демо-среды CargoFlow.",
      createdAt: addDays(now, -r.int(90, 700)),
    });
    const uid = r.uuid();
    users.push({ id: uid, email: `admin.${slug(name)}@carriers.cargoflow.demo`, passwordHash, ...person(), phone: phone() });
    members.push({ companyId: id, userId: uid, role: "CARRIER_ADMIN" });
    return { id, name, adminId: uid };
  });

  // ───────── Автопарк: 20 машин и 20 водителей (12 — у ключевого перевозчика) ─────────
  type Pair = { vehicleId: string; driverId: string; driverUserId: string; carrierId: string; carrierAdminId: string; plate: string };
  const vehicles: Prisma.VehicleCreateManyInput[] = [];
  const drivers: Prisma.DriverProfileCreateManyInput[] = [];
  const pairs: Pair[] = rep(20, (i) => {
    const anchorPair = i < 12;
    const carrierId = anchorPair ? aCarrier.id : carrierList[i - 12].id;
    const carrierAdminId = anchorPair ? memberOf(aCarrier, "CARRIER_ADMIN") : carrierList[i - 12].adminId;
    const v = VEHICLES[i % VEHICLES.length];
    const vehicleId = r.uuid();
    const plate = `${r.int(100, 999)} ${r.pick(["AB", "BC", "KZ", "TR", "AX", "EE", "DM"])}${r.pick(["A", "B", "C", "D"])} ${String(r.int(1, 19)).padStart(2, "0")}`;
    vehicles.push({
      id: vehicleId,
      companyId: carrierId,
      plateNumber: plate,
      country: "KZ",
      make: v.make,
      model: v.model,
      year: r.int(2014, 2024),
      vehicleType: v.type,
      bodyType: v.body,
      capacityKg: v.capacityKg,
      volumeM3: v.volumeM3,
      gpsEnabled: r.chance(0.7),
      status: i === 19 ? "MAINTENANCE" : "AVAILABLE",
      fuelType: "DIESEL",
    });
    const p = person();
    const driverUserId = r.uuid();
    users.push({
      id: driverUserId,
      email: `driver${String(i + 1).padStart(2, "0")}@drivers.cargoflow.demo`,
      passwordHash,
      ...p,
      phone: phone(),
    });
    members.push({ companyId: carrierId, userId: driverUserId, role: "DRIVER" });
    const driverId = r.uuid();
    drivers.push({
      id: driverId,
      userId: driverUserId,
      companyId: carrierId,
      fullName: `${p.firstName} ${p.lastName}`,
      phone: phone(),
      licenseNumber: `DEMO${String(700000 + i * 37)}`,
      licenseCategory: "CE",
      licenseExpiry: addDays(now, r.int(200, 1500)),
      status: i === 18 ? "INACTIVE" : "ACTIVE",
    });
    return { vehicleId, driverId, driverUserId, carrierId, carrierAdminId, plate };
  });

  await prisma.company.createMany({ data: companies });
  await prisma.user.createMany({ data: users });
  await prisma.companyMember.createMany({ data: members });
  await prisma.vehicle.createMany({ data: vehicles });
  await prisma.driverProfile.createMany({ data: drivers });

  // ───────── Грузы, ставки, перевозки ─────────
  const plan = buildPlan();
  const nOrders = plan.filter((p) => p.kind === "order").length;
  const loadNos = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT nextval('"load_number_seq"') AS n FROM generate_series(1, ${plan.length})`,
  );
  const orderNos = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT nextval('"order_number_seq"') AS n FROM generate_series(1, ${nOrders})`,
  );
  const num = (prefix: string, n: bigint) => `${prefix}${String(Number(n)).padStart(6, "0")}`;

  const loads: Prisma.LoadCreateManyInput[] = [];
  const stops: Prisma.LoadStopCreateManyInput[] = [];
  const bids: Prisma.BidCreateManyInput[] = [];
  const orders: Prisma.TransportOrderCreateManyInput[] = [];
  const participants: Prisma.TransportOrderParticipantCreateManyInput[] = [];
  const threads: Prisma.ChatThreadCreateManyInput[] = [];
  const history: Prisma.TransportOrderStatusHistoryCreateManyInput[] = [];
  const tracking: Prisma.TrackingEventCreateManyInput[] = [];
  const documents: (Prisma.OrderDocumentCreateManyInput & { title: string })[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const contractOrders: {
    orderId: string;
    signed: boolean;
    signAt: Date;
    shipperId: string;
    shipperUserId: string;
    carrierId: string;
    carrierUserId: string;
  }[] = [];
  const busyPairs = new Set<number>();
  // Активные рейсы: 11 у ключевого перевозчика (пары 0–10), 6 у других (12–17); пары 11, 18, 19 — свободны
  const activePairQueue = [...rep(11, (i) => i), ...rep(6, (i) => 12 + i)];

  let orderIdx = 0;
  const note = (userId: string, type: NotificationType, title: string, at: Date, link: string, body?: string) => {
    if (at > now) return;
    const ageH = (now.getTime() - at.getTime()) / 3_600_000;
    notifications.push({
      userId,
      type,
      title,
      body,
      link,
      entityType: "TransportOrder",
      createdAt: at,
      readAt: ageH > 36 || r.chance(0.3) ? addDays(at, 0.1) : null,
    });
  };

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    // Владелец: ключевой грузовладелец ~40 %, ключевой экспедитор ~20 %, 40 клиентов — остальное
    const ownerKind = i % 5 < 2 ? "anchorShipper" : i % 5 === 2 ? "anchorForwarder" : "client";
    const client = clientList[i % clientList.length];
    const owner =
      ownerKind === "anchorShipper"
        ? { companyId: aShipper.id, userId: memberOf(aShipper, "SHIPPER"), clientName: null as string | null }
        : ownerKind === "anchorForwarder"
          ? { companyId: aForwarder.id, userId: memberOf(aForwarder, "FORWARDER"), clientName: client.name }
          : { companyId: client.id, userId: client.userId, clientName: null };

    // Маршрут и груз
    let cargo = p.size === "large" ? CARGO.find((c) => c.bodyType === "LOWBED")! : r.pick(CARGO);
    if (p.size === "small") cargo = CARGO.find((c) => c.bodyType === "BOX")!;
    const [fromName, toName] = r.pick(ROUTES);
    const from = CITIES[fromName];
    const to = CITIES[toName];
    const borderKey = [from.country, to.country].sort().join("-");
    const border = from.country !== to.country ? BORDERS[borderKey] : undefined;
    const km = Math.round(roadKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }));
    const days = Math.max(1, Math.round((km / 550) * 10) / 10);
    const weight = p.size === "small" ? 450 : r.int(cargo.weight[0] / 100, cargo.weight[1] / 100) * 100;
    const volume = p.size === "small" ? 4 : r.int(cargo.volume[0], cargo.volume[1]);
    const domestic = from.country === to.country && from.country === "KZ";
    const currency: Currency = domestic ? "KZT" : "USD";
    const usd = Math.round((km * cargo.ratePerKm * r.float(0.9, 1.15)) / 50) * 50 + (p.urgent ? 300 : 0);
    const amount = currency === "KZT" ? Math.round((usd * 480) / 1000) * 1000 : usd;

    // Даты: расписание перевозки и выбор L так, чтобы целевой статус был «сейчас»
    const steps = schedule(days, Boolean(border));
    let L: Date;
    let plannedDelivery: Date;
    let reached: Step[] = [];
    let cancelledAt: Date | null = null;
    if (p.kind === "order") {
      const target = p.status === "CANCELLED" ? p.cancelAfter! : p.status;
      let idx = steps.findIndex((s) => s.status === target);
      if (p.afterBorder && border) idx = steps.map((s) => s.status).lastIndexOf("IN_TRANSIT");
      if (!border && ["AT_BORDER", "CUSTOMS", "BORDER_CLEARED"].includes(target)) idx = steps.findIndex((s) => s.status === "IN_TRANSIT");
      const cur = steps[idx];
      const nextAt = steps[idx + 1]?.at ?? cur.at + 1;
      const into =
        target === "CLOSED" ? r.float(1, 45) : p.status === "CANCELLED" ? r.float(5, 40) : r.float(0.15, 0.75) * (nextAt - cur.at);
      L = addDays(now, -cur.at - into);
      if (p.delayed) {
        // Задержка: машина ещё в пути, а плановая дата доставки уже прошла
        plannedDelivery = addDays(now, -r.float(1, 2));
        L = addDays(plannedDelivery, -(days + 0.5));
      } else {
        plannedDelivery = addDays(L, days + 0.5);
      }
      reached = steps.slice(0, idx + 1);
      if (p.status === "CANCELLED") cancelledAt = addDays(L, cur.at + Math.min(into, 0.6));
    } else {
      L = addDays(now, p.urgent ? 0.3 : r.int(3, 21));
      plannedDelivery = addDays(L, days + 0.5);
    }
    if (p.urgent && p.kind === "order") plannedDelivery = addDays(L, days + 0.1);

    // Груз
    const loadId = r.uuid();
    const loadStatus: LoadStatus = p.kind === "order" ? (p.status === "CANCELLED" ? "CANCELLED" : "CONVERTED_TO_ORDER") : p.status;
    const createdAt = p.kind === "order" ? addDays(L, -r.float(7, 12)) : addDays(now, -r.float(0.2, 6));
    const published = loadStatus !== "DRAFT";
    loads.push({
      id: loadId,
      publicNumber: num("CF-L-", loadNos[i].n),
      companyId: owner.companyId,
      createdByUserId: owner.userId,
      clientName: owner.clientName,
      title: `${p.urgent ? "Срочно: " : ""}${cargo.title}: ${from.name} — ${to.name}`,
      cargoType: cargo.cargoType,
      cargoDescription: p.size === "large" ? "Негабаритный груз, требуется сопровождение и согласование маршрута." : null,
      weightKg: weight,
      volumeM3: volume,
      packagesCount: p.size === "small" ? 6 : r.int(10, 33),
      packageType: cargo.packageType,
      vehicleType: p.size === "small" ? "TRUCK" : cargo.vehicleType,
      bodyType: cargo.bodyType,
      temperatureFrom: cargo.temperature?.[0] ?? null,
      temperatureTo: cargo.temperature?.[1] ?? null,
      requiresGps: r.chance(0.4),
      requirements: p.urgent
        ? "Срочная доставка — приоритетная загрузка в день подачи."
        : cargo.temperature
          ? "Термописец, контроль температуры в пути."
          : null,
      priceType: p.kind === "load" && i % 7 === 0 ? "REQUEST_QUOTE" : r.chance(0.6) ? "NEGOTIABLE" : "FIXED",
      targetPrice: p.kind === "load" && i % 7 === 0 ? null : amount,
      currency,
      loadingDateFrom: L,
      loadingDateTo: addDays(L, p.urgent ? 0.2 : 1),
      deliveryDateFrom: plannedDelivery,
      deliveryDateTo: addDays(plannedDelivery, 1),
      status: loadStatus,
      visibility: published ? "MARKETPLACE" : "DRAFT",
      originCountry: from.country,
      originCity: from.name,
      destinationCountry: to.country,
      destinationCity: to.name,
      publishedAt: published ? addDays(createdAt, 0.1) : null,
      cancelledAt: p.kind === "load" && p.status === "CANCELLED" ? addDays(createdAt, 1) : cancelledAt,
      cancelReason:
        loadStatus === "CANCELLED"
          ? r.pick(["Поставка перенесена клиентом", "Изменились условия контракта", "Груз отправлен другим видом транспорта"])
          : null,
      createdAt,
    });
    const stopList: { type: "PICKUP" | "BORDER" | "DELIVERY"; city: City; at: Date }[] = [
      { type: "PICKUP", city: from, at: L },
      ...(border ? [{ type: "BORDER" as const, city: border, at: addDays(L, 0.35 + days * 0.45) }] : []),
      { type: "DELIVERY", city: to, at: plannedDelivery },
    ];
    stopList.forEach((s, seq) =>
      stops.push({
        loadId,
        sequence: seq + 1,
        type: s.type,
        country: s.city.country,
        city: s.city.name,
        fullAddress: s.type === "BORDER" ? `МАПП ${s.city.name}` : `${s.city.name}, промзона, склад ${r.int(1, 40)}`,
        latitude: s.city.lat,
        longitude: s.city.lng,
        contactName: s.type === "BORDER" ? null : `${r.pick(OFFICE_NAMES)} (склад)`,
        contactPhone: s.type === "BORDER" ? null : phone(),
        plannedDateFrom: s.at,
        plannedDateTo: addDays(s.at, 0.25),
        timezone: s.city.tz,
      }),
    );
    // Сиды в сеть не ходят: километраж — оценка по прямой × коэффициент
    Object.assign(loads[loads.length - 1], estimatedRouteFields(stopList.map((s) => ({ latitude: s.city.lat, longitude: s.city.lng }))));

    // Ставки на бирже: 1–3 предложения на грузе «идут торги»
    if (p.kind === "load" && p.status === "BIDDING") {
      const bidders = new Set<number>();
      const n = r.int(1, 3);
      while (bidders.size < n) bidders.add(r.index(carrierList.length + 1));
      for (const b of bidders) {
        const isAnchor = b === carrierList.length;
        const carrierId = isAnchor ? aCarrier.id : carrierList[b].id;
        const userId = isAnchor ? memberOf(aCarrier, "CARRIER_ADMIN") : carrierList[b].adminId;
        const at = addDays(createdAt, r.float(0.2, 2));
        bids.push({
          loadId,
          carrierCompanyId: carrierId,
          createdByUserId: userId,
          amount: Math.round((amount * r.float(0.92, 1.08)) / 10) * 10,
          currency,
          comment: "Готовы подать машину в срок.",
          readyDate: L,
          status: "PENDING",
          awaitingSide: "CUSTOMER",
          createdAt: at,
        });
        note(owner.userId, "NEW_BID", `Новое предложение по грузу ${num("CF-L-", loadNos[i].n)}`, at, `/loads/${loadId}?tab=bids`);
      }
      continue;
    }
    if (p.kind !== "order") continue;

    // Перевозка: перевозчик и пара «машина + водитель»
    const target = p.status === "CANCELLED" ? p.cancelAfter! : p.status;
    const isActive = ACTIVE.includes(target) && p.status !== "CANCELLED";
    let pairIdx: number;
    if (isActive) {
      pairIdx = activePairQueue.shift()!;
      busyPairs.add(pairIdx);
    } else {
      pairIdx = r.index(18); // история: любые пары, кроме обслуживаемой машины
    }
    const pair = pairs[pairIdx];
    const orderId = r.uuid();
    const bidId = r.uuid();
    const orderNo = num("CF-O-", orderNos[orderIdx++].n);
    const isForwarder = owner.companyId === aForwarder.id;
    const at = (s: OrderStatus) => reached.find((x) => x.status === s);
    const atDate = (s: OrderStatus) => (at(s) ? addDays(L, at(s)!.at) : null);
    const hasVehicle = Boolean(at("VEHICLE_ASSIGNED"));
    const hasDriver = Boolean(at("DRIVER_ASSIGNED"));
    const last = reached[reached.length - 1];
    const prev = reached[reached.length - 2];
    const currentStatus: OrderStatus = p.status === "CANCELLED" ? "CANCELLED" : last.status;
    const statusChangedAt = cancelledAt ?? addDays(L, last.at);
    const deliveredAt = atDate("DELIVERED");
    const closedAt = atDate("CLOSED");

    bids.push({
      id: bidId,
      loadId,
      carrierCompanyId: pair.carrierId,
      createdByUserId: pair.carrierAdminId,
      amount,
      currency,
      comment: "Собственный тягач, водитель с опытом международных рейсов.",
      readyDate: L,
      status: "ACCEPTED",
      awaitingSide: "CUSTOMER",
      decidedAt: atDate("CARRIER_SELECTED"),
      decidedByUserId: owner.userId,
      createdAt: addDays(createdAt, 0.5),
    });
    orders.push({
      id: orderId,
      publicNumber: orderNo,
      loadId,
      shipperCompanyId: owner.companyId,
      carrierCompanyId: pair.carrierId,
      forwarderCompanyId: isForwarder ? aForwarder.id : null,
      acceptedBidId: bidId,
      agreedAmount: amount,
      currency,
      currentStatus,
      previousStatus: p.status === "CANCELLED" ? last.status : (prev?.status ?? null),
      statusChangedAt,
      loadingDate: L,
      deliveryDate: plannedDelivery,
      vehicleId: hasVehicle ? pair.vehicleId : null,
      driverId: hasDriver ? pair.driverId : null,
      deliveredAt,
      confirmationDueAt: deliveredAt ? addDays(deliveredAt, 3) : null,
      receiptConfirmedAt: closedAt,
      closedAt,
      cancelledAt,
      createdAt: atDate("CARRIER_SELECTED")!,
    });
    participants.push(
      { orderId, companyId: owner.companyId, role: isForwarder ? "FORWARDER" : "SHIPPER" },
      { orderId, companyId: pair.carrierId, role: "CARRIER" },
      ...(hasDriver ? [{ orderId, userId: pair.driverUserId, role: "DRIVER" as const }] : []),
    );
    threads.push({ orderId });

    // История статусов
    const DRIVER_STEPS: OrderStatus[] = [
      "AT_LOADING",
      "LOADED",
      "IN_TRANSIT",
      "AT_BORDER",
      "CUSTOMS",
      "BORDER_CLEARED",
      "AT_DELIVERY",
      "DELIVERED",
    ];
    const COMMENTS: Partial<Record<OrderStatus, string>> = {
      CARRIER_SELECTED: "Принято предложение перевозчика",
      CONTRACT_SIGNED: "Договор подписан обеими сторонами",
      VEHICLE_ASSIGNED: `Назначен автомобиль ${pair.plate}`,
      AT_LOADING: "Машина прибыла на загрузку",
      LOADED: "Погрузка завершена, пломба установлена",
      AT_BORDER: border ? `Прибыл на пункт пропуска ${border.name}` : undefined,
      CUSTOMS: "Таможенное оформление",
      BORDER_CLEARED: "Граница пройдена",
      AT_DELIVERY: "Прибыл на разгрузку",
      DELIVERED: "Груз доставлен, документы загружены",
      CLOSED: "Получение подтверждено, перевозка закрыта",
    };
    reached.forEach((s, k) => {
      const byDriver = DRIVER_STEPS.includes(s.status);
      const auto = s.status === "CONTRACT_SIGNED" || s.status === "CLOSED";
      history.push({
        orderId,
        fromStatus: k === 0 ? null : reached[k - 1].status,
        toStatus: s.status,
        actorUserId: auto ? null : byDriver ? pair.driverUserId : s.status === "CARRIER_SELECTED" ? owner.userId : pair.carrierAdminId,
        actorType: auto ? "SYSTEM" : byDriver ? "DRIVER" : "USER",
        source: auto ? "SYSTEM" : byDriver ? "DRIVER_APP" : "WEB",
        comment: COMMENTS[s.status] ?? null,
        createdAt: addDays(L, s.at),
      });
    });
    if (p.status === "CANCELLED") {
      history.push({
        orderId,
        fromStatus: last.status,
        toStatus: "CANCELLED",
        actorUserId: owner.userId,
        actorType: "USER",
        source: "WEB",
        comment: "Отмена по соглашению сторон",
        createdAt: cancelledAt!,
      });
    }

    // Договор (создаётся тем же сервисом, что и в рабочем процессе)
    if (at("CONTRACT_PENDING")) {
      contractOrders.push({
        orderId,
        signed: Boolean(at("CONTRACT_SIGNED")),
        signAt: atDate("CONTRACT_SIGNED") ?? now,
        shipperId: owner.companyId,
        shipperUserId: owner.userId,
        carrierId: pair.carrierId,
        carrierUserId: pair.carrierAdminId,
      });
    }

    // Трекинг: события водителя и отметки местоположения по пути
    const TRACK: Partial<
      Record<
        OrderStatus,
        "ARRIVED_LOADING" | "LOADED" | "DEPARTED" | "BORDER_ARRIVED" | "BORDER_CLEARED" | "DELIVERY_ARRIVED" | "DELIVERED"
      >
    > = {
      AT_LOADING: "ARRIVED_LOADING",
      LOADED: "LOADED",
      AT_BORDER: "BORDER_ARRIVED",
      BORDER_CLEARED: "BORDER_CLEARED",
      AT_DELIVERY: "DELIVERY_ARRIVED",
      DELIVERED: "DELIVERED",
    };
    const pointAt = (dayOffset: number) => {
      const t = Math.min(1, Math.max(0, dayOffset / days));
      if (!border) return lerp(from, to, t);
      const bt = 0.45;
      return t < bt ? lerp(from, border, t / bt) : lerp(border, to, (t - bt) / (1 - bt));
    };
    let departed = false;
    for (const s of reached) {
      const when = addDays(L, s.at);
      const type = s.status === "IN_TRANSIT" && !departed ? "DEPARTED" : TRACK[s.status];
      if (s.status === "IN_TRANSIT") departed = true;
      if (!type) continue;
      const pos =
        s.status === "AT_BORDER" || s.status === "BORDER_CLEARED"
          ? border!
          : s.status === "AT_DELIVERY" || s.status === "DELIVERED"
            ? to
            : s.at <= 0.35
              ? from
              : pointAt(s.at);
      tracking.push({
        orderId,
        userId: pair.driverUserId,
        type,
        latitude: pos.lat,
        longitude: pos.lng,
        accuracy: r.int(8, 40),
        source: "DRIVER_APP",
        recordedAt: when,
        createdAt: when,
      });
    }
    if (departed) {
      const endAt = Math.min(at("AT_DELIVERY")?.at ?? Infinity, (now.getTime() - L.getTime()) / DAY);
      for (let d = 0.8; d < endAt && d < days; d += r.float(0.45, 0.8)) {
        const pos = pointAt(d);
        const when = addDays(L, d);
        tracking.push({
          orderId,
          userId: pair.driverUserId,
          type: "MANUAL_LOCATION",
          latitude: pos.lat + r.float(-0.05, 0.05),
          longitude: pos.lng + r.float(-0.05, 0.05),
          accuracy: r.int(10, 60),
          note: r.chance(0.2) ? "Остановка на отдых" : null,
          source: r.chance(0.5) ? "DRIVER_APP" : "GPS_PROVIDER",
          recordedAt: when,
          createdAt: when,
        });
      }
    }

    // Документы (метаданные + PDF-заполнитель)
    const docAt = atDate("LOADED");
    if (docAt) {
      const doc = (
        type: "CMR" | "INVOICE" | "PACKING_LIST" | "PROOF_OF_DELIVERY",
        title: string,
        by: string,
        byCompany: string,
        when: Date,
      ) => {
        const id = r.uuid();
        documents.push({
          id,
          groupId: id,
          orderId,
          uploadedByUserId: by,
          uploadedCompanyId: byCompany,
          type,
          filename: `${title.toLowerCase().replace(/\s+/g, "-")}-${orderNo}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          storageKey: `demo/documents/${orderNo}/${type.toLowerCase()}.pdf`,
          note: "Демо-документ (заполнитель)",
          createdAt: when,
          title,
        });
      };
      doc("INVOICE", "Invoice", owner.userId, owner.companyId, addDays(docAt, -0.3));
      doc("PACKING_LIST", "Packing list", owner.userId, owner.companyId, addDays(docAt, -0.3));
      doc("CMR", "CMR", pair.driverUserId, pair.carrierId, docAt);
      if (deliveredAt) doc("PROOF_OF_DELIVERY", "POD", pair.driverUserId, pair.carrierId, deliveredAt);
    }

    // Уведомления участникам (часть прочитана, свежие — нет)
    const link = `/orders/${orderId}`;
    note(pair.carrierAdminId, "BID_ACCEPTED", `Новый груз назначен перевозчику: ${orderNo}`, atDate("CARRIER_SELECTED")!, link);
    if (hasDriver) note(owner.userId, "DRIVER_ASSIGNED", `Водитель принял заявку ${orderNo}`, atDate("DRIVER_ASSIGNED")!, link);
    if (at("AT_LOADING")) note(owner.userId, "STATUS_CHANGED", `Машина прибыла на загрузку · ${orderNo}`, atDate("AT_LOADING")!, link);
    if (departed) note(owner.userId, "STATUS_CHANGED", `Груз отправлен · ${orderNo}`, addDays(L, 0.35), link);
    if (at("BORDER_CLEARED")) note(owner.userId, "STATUS_CHANGED", `Груз пересёк границу · ${orderNo}`, atDate("BORDER_CLEARED")!, link);
    if (docAt) note(pair.carrierAdminId, "NEW_DOCUMENT", `Документ требует проверки: CMR ${orderNo}`, docAt, `${link}?tab=documents`);
    if (p.delayed)
      note(
        owner.userId,
        "SYSTEM",
        `Изменён ETA · ${orderNo}`,
        addDays(now, -0.2),
        link,
        "Ожидается задержка доставки: машина ещё в пути, плановая дата прошла.",
      );
    if (deliveredAt) note(owner.userId, "STATUS_CHANGED", `Груз доставлен · ${orderNo} — подтвердите получение`, deliveredAt, link);
    if (closedAt) {
      note(owner.userId, "DELIVERY_CONFIRMED", `Доставка завершена · ${orderNo}`, closedAt, link);
      note(pair.carrierAdminId, "DELIVERY_CONFIRMED", `Доставка завершена · ${orderNo}`, closedAt, link);
    }
  }

  // Машины в рейсе — «назначены», остальные свободны (одна на обслуживании)
  const busyVehicleIds = [...busyPairs].map((i) => pairs[i].vehicleId);

  // ───────── Запись в базу пакетами ─────────
  await prisma.load.createMany({ data: loads });
  await prisma.loadStop.createMany({ data: stops });
  await prisma.bid.createMany({ data: bids });
  await prisma.transportOrder.createMany({ data: orders });
  await prisma.transportOrderParticipant.createMany({ data: participants });
  await prisma.chatThread.createMany({ data: threads });
  await prisma.transportOrderStatusHistory.createMany({ data: history });
  await prisma.trackingEvent.createMany({ data: tracking });
  await prisma.vehicle.updateMany({ where: { id: { in: busyVehicleIds } }, data: { status: "ASSIGNED" } });

  // Договоры: тот же сервис формирования, подписи — для подписанных
  for (const c of contractOrders) {
    await prisma.$transaction(async (tx) => {
      const contract = await createContractInTx(tx, null, c.orderId);
      if (!c.signed) return;
      await tx.contractSignature.createMany({
        data: [
          {
            contractId: contract.id,
            userId: c.shipperUserId,
            companyId: c.shipperId,
            side: "CUSTOMER",
            method: "INTERNAL_ACCEPTANCE",
            signedAt: addDays(c.signAt, -0.2),
            documentHash: contract.contentHash,
          },
          {
            contractId: contract.id,
            userId: c.carrierUserId,
            companyId: c.carrierId,
            side: "CARRIER",
            method: "INTERNAL_ACCEPTANCE",
            signedAt: c.signAt,
            documentHash: contract.contentHash,
          },
        ],
      });
      await tx.contract.update({ where: { id: contract.id }, data: { status: "SIGNED", signedAt: c.signAt } });
    });
  }

  // Документы: PDF-заполнитель в хранилище (по 4 параллельно) + метаданные
  const pdfCache = new Map<string, Buffer>();
  for (let k = 0; k < documents.length; k += 4) {
    await Promise.all(
      documents.slice(k, k + 4).map(async (d) => {
        const bytes = pdfCache.get(d.title) ?? (await placeholderPdf(d.title, "demo"));
        pdfCache.set(d.title, bytes);
        d.size = bytes.length;
        await storage().put(d.storageKey, bytes, "application/pdf");
      }),
    );
  }
  await prisma.orderDocument.createMany({ data: documents.map(({ title: _title, ...d }) => d) });
  await prisma.notification.createMany({ data: notifications });

  return {
    clients: clientList.length,
    carriers: carrierList.length,
    vehicles: vehicles.length,
    drivers: drivers.length,
    loads: loads.length,
    orders: orders.length,
    activeTrips: busyPairs.size,
    trackingEvents: tracking.length,
    trackedOrders: new Set(tracking.map((t) => t.orderId)).size,
    documents: documents.length,
    contracts: contractOrders.length,
    notifications: notifications.length,
  };
}
