/**
 * CargoFlow — демо-данные для локальной разработки.
 *
 * Сделки проводятся через реальный сервисный слой (транзакции, state machine, аудит,
 * уведомления, договоры с hash), а затем исторические даты сдвигаются в прошлое.
 * Все персональные данные вымышлены.
 *
 * Запуск: npm run db:seed   (ВНИМАНИЕ: очищает базу данных!)
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";

// Не отправлять dev-письма при генерации демо-данных
process.env.EMAIL_DRIVER = "none";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildActor, type Actor } from "@/lib/auth/actor";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { DEMO_CONTRACT_TEMPLATE, DEMO_TEMPLATE_CODE } from "@/lib/contracts/template";
import { loadInputSchema, type LoadInput } from "@/lib/validation/load";
import { acceptBid, counterBid, createBid, respondToCounter } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import { uploadOrderDocument } from "@/server/services/document.service";
import { assignDriver, assignVehicle, changeStatus, confirmDelivery, reportDelivered } from "@/server/services/order.service";
import { createLoad } from "@/server/services/load.service";
import { createPayment } from "@/server/services/payment.service";
import { createReview } from "@/server/services/review.service";
import { addLocation } from "@/server/services/tracking.service";
import { sendMessage } from "@/server/services/chat.service";
import { openDispute } from "@/server/services/dispute.service";
import { DEFAULT_SETTINGS } from "@/server/services/settings.service";
import { initiateSecureDeal } from "@/server/services/secure-deal.service";
import { createMovement } from "@/server/services/next-load.service";
import { seedFuelDemo } from "./seed-fuel";

export const DEMO_PASSWORD = "Demo1234!";
const META = { ip: "127.0.0.1", userAgent: "cargoflow-seed" };
const DAY = 24 * 60 * 60_000;

// Минимальный валидный PNG (1×1)
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function makePdf(title: string, lines: string[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 50, y: 780, size: 18, font });
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save());
}

function file(buf: Buffer, name: string, type: string) {
  return new File([new Uint8Array(buf)], name, { type });
}

async function truncateAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  for (const seq of ["load_number_seq", "order_number_seq", "contract_number_seq"]) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${seq}" RESTART WITH 1`);
  }
}

async function user(
  email: string,
  firstName: string,
  lastName: string,
  phone: string,
  platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
  password = DEMO_PASSWORD,
) {
  return prisma.user.create({
    data: { email, firstName, lastName, phone, platformRole, passwordHash: await hashPassword(password) },
  });
}

/**
 * Пароль демо-администратора платформы. Вне production — общий демо-пароль.
 * В production общеизвестный пароль администратора недопустим: берётся DEMO_ADMIN_PASSWORD,
 * а если он не задан — случайный пароль, который нигде не выводится (доступ — через сброс пароля или переменную).
 */
function demoAdminPassword(): { password: string; note: string } {
  if (process.env.NODE_ENV !== "production") return { password: DEMO_PASSWORD, note: DEMO_PASSWORD };
  const fromEnv = process.env.DEMO_ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length >= 12 && fromEnv !== DEMO_PASSWORD) return { password: fromEnv, note: "из DEMO_ADMIN_PASSWORD" };
  return { password: randomBytes(24).toString("base64url"), note: "случайный (задайте DEMO_ADMIN_PASSWORD, не короче 12 символов)" };
}

const actor = (userId: string, companyId?: string) => buildActor(userId, { activeCompanyId: companyId ?? null, meta: META });

function date(offsetDays: number, hourUtc = 3) {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

function loadInput(over: Partial<LoadInput> & { stops: LoadInput["stops"] }): ReturnType<typeof loadInputSchema.parse> {
  return loadInputSchema.parse({
    title: "Груз",
    cargoType: "GENERAL",
    weightKg: 20000,
    volumeM3: 82,
    packagesCount: 33,
    packageType: "Паллеты EUR",
    vehicleType: "TRACTOR_TRAILER",
    bodyType: "CURTAINSIDER",
    requiresGps: false,
    priceType: "NEGOTIABLE",
    targetPrice: 4500,
    currency: "USD",
    visibility: "MARKETPLACE",
    invitedCarrierIds: [],
    ...over,
  });
}

const ROUTE_CN_ALA_MSK = (start: number): LoadInput["stops"] => [
  {
    type: "PICKUP",
    country: "CN",
    city: "Урумчи",
    street: "ул. Хэпин",
    building: "88",
    fullAddress: "Урумчи, промзона Мидун, склад 12",
    plannedDateFrom: date(start, 1),
    plannedDateTo: date(start, 9),
    contactName: "Складской оператор",
    contactPhone: "+86 991 000 0001",
  },
  { type: "BORDER", country: "KZ", city: "Хоргос", fullAddress: "МАПП Нуржолы", plannedDateFrom: date(start + 2) },
  { type: "TRANSIT", country: "KZ", city: "Алматы", fullAddress: "Алматы, терминал «Демо»", plannedDateFrom: date(start + 3) },
  {
    type: "DELIVERY",
    country: "RU",
    city: "Москва",
    street: "МКАД 41-й км",
    building: "с1",
    fullAddress: "Москва, МКАД 41-й км, склад «Демо-Логистик»",
    plannedDateFrom: date(start + 9, 6),
    plannedDateTo: date(start + 9, 14),
    contactName: "Приёмка",
    contactPhone: "+7 495 000 00 01",
  },
];

/** Сдвигает все временные метки сделки в прошлое (демо-историчность). */
async function shiftOrderToPast(orderId: string, days: number) {
  const iv = `${days} days`;
  const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
  const bids = await prisma.bid.findMany({ where: { loadId: order.loadId }, select: { id: true } });
  const bidIds = bids.map((b) => b.id);
  const q = (sql: string, ...params: unknown[]) => prisma.$executeRawUnsafe(sql, ...params);
  await q(
    `UPDATE "TransportOrder" SET "createdAt"="createdAt"-$1::interval, "updatedAt"="updatedAt"-$1::interval, "statusChangedAt"="statusChangedAt"-$1::interval, "loadingDate"="loadingDate"-$1::interval, "deliveryDate"="deliveryDate"-$1::interval, "deliveredAt"="deliveredAt"-$1::interval, "closedAt"="closedAt"-$1::interval, "confirmationDueAt"="confirmationDueAt"-$1::interval, "receiptConfirmedAt"="receiptConfirmedAt"-$1::interval WHERE id=$2::uuid`,
    iv,
    orderId,
  );
  await q(
    `UPDATE "Load" SET "createdAt"="createdAt"-$1::interval, "updatedAt"="updatedAt"-$1::interval, "publishedAt"="publishedAt"-$1::interval, "loadingDateFrom"="loadingDateFrom"-$1::interval, "loadingDateTo"="loadingDateTo"-$1::interval, "deliveryDateFrom"="deliveryDateFrom"-$1::interval, "deliveryDateTo"="deliveryDateTo"-$1::interval WHERE id=$2::uuid`,
    iv,
    order.loadId,
  );
  await q(
    `UPDATE "LoadStop" SET "plannedDateFrom"="plannedDateFrom"-$1::interval, "plannedDateTo"="plannedDateTo"-$1::interval WHERE "loadId"=$2::uuid`,
    iv,
    order.loadId,
  );
  await q(
    `UPDATE "Bid" SET "createdAt"="createdAt"-$1::interval, "updatedAt"="updatedAt"-$1::interval, "decidedAt"="decidedAt"-$1::interval WHERE "loadId"=$2::uuid`,
    iv,
    order.loadId,
  );
  await q(`UPDATE "BidMessage" SET "createdAt"="createdAt"-$1::interval WHERE "bidId" = ANY($2::uuid[])`, iv, bidIds);
  for (const t of ["TransportOrderStatusHistory", "TrackingEvent", "OrderDocument", "PaymentRecord", "Review", "Dispute"]) {
    await q(`UPDATE "${t}" SET "createdAt"="createdAt"-$1::interval WHERE "orderId"=$2::uuid`, iv, orderId);
  }
  await q(`UPDATE "TrackingEvent" SET "recordedAt"="recordedAt"-$1::interval WHERE "orderId"=$2::uuid`, iv, orderId);
  await q(
    `UPDATE "PaymentRecord" SET "paidAt"="paidAt"-$1::interval, "dueDate"="dueDate"-$1::interval, "authorizedAt"="authorizedAt"-$1::interval, "reservedAt"="reservedAt"-$1::interval, "releaseRequestedAt"="releaseRequestedAt"-$1::interval, "releasedAt"="releasedAt"-$1::interval, "refundedAt"="refundedAt"-$1::interval, "updatedAt"="updatedAt"-$1::interval WHERE "orderId"=$2::uuid`,
    iv,
    orderId,
  );
  for (const t of ["PaymentTransaction", "PaymentStatusHistory"]) {
    await q(
      `UPDATE "${t}" SET "createdAt"="createdAt"-$1::interval${t === "PaymentTransaction" ? `, "completedAt"="completedAt"-$1::interval` : ""} WHERE "paymentId" IN (SELECT id FROM "PaymentRecord" WHERE "orderId"=$2::uuid)`,
      iv,
      orderId,
    );
  }
  await q(
    `UPDATE "Contract" SET "createdAt"="createdAt"-$1::interval, "signedAt"="signedAt"-$1::interval WHERE "orderId"=$2::uuid`,
    iv,
    orderId,
  );
  await q(
    `UPDATE "ContractSignature" SET "signedAt"="signedAt"-$1::interval, "createdAt"="createdAt"-$1::interval WHERE "contractId" IN (SELECT id FROM "Contract" WHERE "orderId"=$2::uuid)`,
    iv,
    orderId,
  );
  await q(
    `UPDATE "ChatMessage" SET "createdAt"="createdAt"-$1::interval WHERE "threadId" IN (SELECT id FROM "ChatThread" WHERE "orderId"=$2::uuid)`,
    iv,
    orderId,
  );
  await q(`UPDATE "AuditLog" SET "createdAt"="createdAt"-$1::interval WHERE "entityId" = ANY($2::text[])`, iv, [
    orderId,
    order.loadId,
    ...bidIds,
  ]);
  await q(
    `UPDATE "Notification" SET "createdAt"="createdAt"-$1::interval, "readAt"=COALESCE("readAt", now()) WHERE "entityId" = ANY($2::text[])`,
    iv,
    [orderId, order.loadId],
  );
}

async function runOrderToSigned(customer: Actor, carrier: Actor, load: Awaited<ReturnType<typeof createLoad>>, amount: number) {
  const bid = await createBid(carrier, load.id, {
    amount,
    currency: "USD",
    comment: "Готовы подать машину вовремя, опыт на направлении.",
    readyDate: null,
    terms: null,
    validUntil: null,
  });
  const { orderId, contractId } = await acceptBid(customer, bid.id);
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  await signContract(customer, contractId, { password: DEMO_PASSWORD, documentHash: contract.contentHash });
  await signContract(carrier, contractId, { password: DEMO_PASSWORD, documentHash: contract.contentHash });
  return orderId;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "1") {
    throw new Error("Seed очищает базу данных. В production запуск запрещён (ALLOW_PRODUCTION_SEED=1 для принудительного запуска).");
  }
  console.log("→ Очистка базы данных");
  await truncateAll();

  await prisma.platformSetting.createMany({
    data: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: value as never })),
  });
  // Демо: комиссия платформы 2% по безопасной сделке ($3 000 → $60, перевозчику $2 940)
  await prisma.platformSetting.update({ where: { key: "commissionPercent" }, data: { value: 2 } });
  await prisma.contractTemplate.create({
    data: { code: DEMO_TEMPLATE_CODE, name: "Договор-заявка на международную перевозку (демо)", version: 1, body: DEMO_CONTRACT_TEMPLATE },
  });

  console.log("→ Пользователи и компании");
  const uShipper = await user("shipper@cargoflow.demo", "Алия", "Демоева", "+7 700 000 00 01");
  const uCarrier = await user("carrier@cargoflow.demo", "Ержан", "Тестов", "+7 700 000 00 02");
  const uDispatcher = await user("dispatcher@cargoflow.demo", "Марина", "Диспетчерова", "+7 700 000 00 03");
  const uForwarder = await user("forwarder@cargoflow.demo", "Олег", "Экспедиторов", "+7 900 000 00 04");
  const uDriver = await user("driver@cargoflow.demo", "Demo", "Driver", "+7 700 000 00 05");
  const uDriver2 = await user("driver2@cargoflow.demo", "Нурлан", "Рейсов", "+7 700 000 00 06");
  const uCarrier2 = await user("carrier2@cargoflow.demo", "Ли", "Демо", "+86 138 0000 0007");
  const adminPassword = demoAdminPassword();
  const uAdmin = await user("admin@cargoflow.demo", "Demo", "Admin", "+7 700 000 00 99", "PLATFORM_ADMIN", adminPassword.password);

  const shipperCo = await prisma.company.create({
    data: {
      type: "SHIPPER",
      legalName: "Demo Cargo Kazakhstan",
      tradeName: "Demo Cargo",
      registrationNumber: "DEMO-KZ-000001",
      taxId: "000000000001",
      country: "KZ",
      city: "Алматы",
      address: "пр. Демонстрационный, 1, офис 10",
      phone: "+7 727 000 00 01",
      email: "office@demo-cargo.demo",
      verificationStatus: "VERIFIED",
      description: "Импорт электроники и оборудования из Китая.",
    },
  });
  const carrierCo = await prisma.company.create({
    data: {
      type: "CARRIER",
      legalName: "Demo Trans Logistics",
      registrationNumber: "DEMO-KZ-000002",
      taxId: "000000000002",
      country: "KZ",
      city: "Алматы",
      address: "ул. Транспортная, 7",
      phone: "+7 727 000 00 02",
      email: "dispatch@demo-trans.demo",
      verificationStatus: "VERIFIED",
      description: "Международные перевозки Китай — Казахстан — Россия. Собственный парк тягачей.",
    },
  });
  const forwarderCo = await prisma.company.create({
    data: {
      type: "FORWARDER",
      legalName: "Demo Forwarding",
      registrationNumber: "DEMO-RU-000003",
      taxId: "0000000003",
      country: "RU",
      city: "Москва",
      address: "ул. Логистическая, 3",
      phone: "+7 495 000 00 03",
      email: "ops@demo-forwarding.demo",
      verificationStatus: "VERIFIED",
    },
  });
  const carrier2Co = await prisma.company.create({
    data: {
      type: "CARRIER",
      legalName: "Demo Silk Road Carriers",
      registrationNumber: "DEMO-CN-000004",
      country: "CN",
      city: "Урумчи",
      address: "Демо-проспект, 88",
      phone: "+86 991 000 0004",
      email: "info@demo-silkroad.demo",
      verificationStatus: "PENDING",
    },
  });

  await prisma.companyMember.createMany({
    data: [
      { companyId: shipperCo.id, userId: uShipper.id, role: "SHIPPER" },
      { companyId: carrierCo.id, userId: uCarrier.id, role: "CARRIER_ADMIN" },
      { companyId: carrierCo.id, userId: uDispatcher.id, role: "CARRIER_DISPATCHER" },
      { companyId: carrierCo.id, userId: uDriver.id, role: "DRIVER" },
      { companyId: carrierCo.id, userId: uDriver2.id, role: "DRIVER" },
      { companyId: forwarderCo.id, userId: uForwarder.id, role: "FORWARDER" },
      { companyId: carrier2Co.id, userId: uCarrier2.id, role: "CARRIER_ADMIN" },
    ],
  });
  const verReq = await prisma.verificationRequest.create({
    data: { companyId: carrier2Co.id, submittedByUserId: uCarrier2.id, comment: "Просим проверить компанию." },
  });
  const regPdf = await makePdf("Registration certificate (DEMO)", ["Demo Silk Road Carriers", "Reg. No DEMO-CN-000004"]);
  const { storage, buildStorageKey } = await import("@/lib/storage/storage");
  const regKey = buildStorageKey(`companies/${carrier2Co.id}`, ".pdf");
  await storage().put(regKey, regPdf, "application/pdf");
  await prisma.companyDocument.create({
    data: {
      companyId: carrier2Co.id,
      uploadedByUserId: uCarrier2.id,
      verificationRequestId: verReq.id,
      type: "REGISTRATION",
      filename: "registration-demo.pdf",
      mimeType: "application/pdf",
      size: regPdf.length,
      storageKey: regKey,
    },
  });
  for (const [co, admin] of [
    [shipperCo, uShipper],
    [carrierCo, uCarrier],
    [forwarderCo, uForwarder],
  ] as const) {
    await prisma.verificationRequest.create({
      data: {
        companyId: co.id,
        submittedByUserId: admin.id,
        status: "APPROVED",
        reviewerUserId: uAdmin.id,
        reviewComment: "Документы проверены (демо).",
        reviewedAt: new Date(Date.now() - 60 * DAY),
      },
    });
  }

  console.log("→ Автопарк и водители");
  const volvo = await prisma.vehicle.create({
    data: {
      companyId: carrierCo.id,
      plateNumber: "KZ 123 AB",
      country: "KZ",
      make: "Volvo",
      model: "FH",
      year: 2021,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 22000,
      volumeM3: 86,
      vin: "DEMOVIN0000000001",
      gpsEnabled: true,
    },
  });
  const man = await prisma.vehicle.create({
    data: {
      companyId: carrierCo.id,
      plateNumber: "KZ 456 CD",
      country: "KZ",
      make: "MAN",
      model: "TGX",
      year: 2020,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 22000,
      volumeM3: 86,
      gpsEnabled: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      companyId: carrierCo.id,
      plateNumber: "KZ 789 EF",
      country: "KZ",
      make: "DAF",
      model: "XF",
      year: 2019,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "REFRIGERATOR",
      capacityKg: 20000,
      volumeM3: 82,
      gpsEnabled: false,
    },
  });
  await prisma.vehicle.create({
    data: {
      companyId: carrierCo.id,
      plateNumber: "KZ 012 GH",
      country: "KZ",
      make: "Scania",
      model: "R450",
      year: 2018,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 20000,
      volumeM3: 82,
      gpsEnabled: true,
      status: "MAINTENANCE",
    },
  });
  const scania2 = await prisma.vehicle.create({
    data: {
      companyId: carrier2Co.id,
      plateNumber: "新A 12345",
      country: "CN",
      make: "Sinotruk",
      model: "HOWO T7H",
      year: 2022,
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 25000,
      volumeM3: 90,
      gpsEnabled: true,
    },
  });
  const driver1 = await prisma.driverProfile.create({
    data: {
      userId: uDriver.id,
      companyId: carrierCo.id,
      fullName: "Demo Driver",
      phone: "+7 700 000 00 05",
      licenseNumber: "DEMO-DL-0001",
      licenseCategory: "CE",
      licenseExpiry: new Date(Date.now() + 700 * DAY),
    },
  });
  const driver2 = await prisma.driverProfile.create({
    data: {
      userId: uDriver2.id,
      companyId: carrierCo.id,
      fullName: "Нурлан Рейсов",
      phone: "+7 700 000 00 06",
      licenseNumber: "DEMO-DL-0002",
      licenseCategory: "CE",
      licenseExpiry: new Date(Date.now() + 500 * DAY),
    },
  });
  await prisma.driverProfile.create({
    data: {
      companyId: carrierCo.id,
      fullName: "Сергей Резервов",
      phone: "+7 700 000 00 08",
      licenseNumber: "DEMO-DL-0003",
      licenseCategory: "CE",
      licenseExpiry: new Date(Date.now() + 300 * DAY),
    },
  });
  const cnDriverUser = await user("driver3@cargoflow.demo", "Ван", "Демо", "+86 138 0000 0009");
  await prisma.companyMember.create({ data: { companyId: carrier2Co.id, userId: cnDriverUser.id, role: "DRIVER" } });
  const cnDriver = await prisma.driverProfile.create({
    data: {
      userId: cnDriverUser.id,
      companyId: carrier2Co.id,
      fullName: "Ван Демо",
      phone: "+86 138 0000 0009",
      licenseNumber: "DEMO-CN-DL-1",
      licenseCategory: "A2",
    },
  });

  const aShipper = await actor(uShipper.id, shipperCo.id);
  const aCarrier = await actor(uCarrier.id, carrierCo.id);
  const aForwarder = await actor(uForwarder.id, forwarderCo.id);
  const aDriver = await actor(uDriver.id, carrierCo.id);
  const aDriver2 = await actor(uDriver2.id, carrierCo.id);
  const aCarrier2 = await actor(uCarrier2.id, carrier2Co.id);
  const aCnDriver = await actor(cnDriverUser.id, carrier2Co.id);

  // ───────── Завершённая перевозка (Volvo + Demo Driver) ─────────
  console.log("→ Завершённая перевозка");
  const lClosed = await createLoad(
    aShipper,
    loadInput({
      title: "Электроника: мониторы и ноутбуки",
      cargoType: "ELECTRONICS",
      cargoDescription: 'Мониторы 27" и ноутбуки в заводской упаковке',
      weightKg: 14500,
      targetPrice: 4300,
      stops: ROUTE_CN_ALA_MSK(1),
    }),
    { publish: true },
  );
  const oClosed = await runOrderToSigned(aShipper, aCarrier, lClosed, 4200);
  await createPayment(aCarrier, oClosed, {
    type: "PREPAYMENT",
    amount: 1500,
    currency: "USD",
    status: "PAID",
    dueDate: null,
    paidAt: null,
    note: "Предоплата по счёту №12",
  });
  await assignVehicle(aCarrier, oClosed, volvo.id);
  await assignDriver(aCarrier, oClosed, driver1.id);
  const st = (a: Actor, id: string, status: Parameters<typeof changeStatus>[2]["status"], lat?: number, lng?: number, comment?: string) =>
    changeStatus(a, id, {
      status,
      comment: comment ?? null,
      documentIds: [],
      latitude: lat ?? null,
      longitude: lng ?? null,
      accuracy: lat ? 25 : null,
    });
  await st(aDriver, oClosed, "AT_LOADING", 43.8256, 87.6168);
  await uploadOrderDocument(aDriver, oClosed, { type: "CARGO_PHOTO", file: file(PNG_1PX, "cargo-loaded.png", "image/png") });
  await st(aDriver, oClosed, "LOADED", 43.8256, 87.6168, "33 паллеты, пломба № DEMO-5521");
  await st(aDriver, oClosed, "IN_TRANSIT", 43.83, 87.6);
  await addLocation(aDriver, oClosed, {
    latitude: 44.2131,
    longitude: 80.4127,
    accuracy: 30,
    note: "Подъезжаю к Хоргосу",
    recordedAt: null,
  });
  await st(aDriver, oClosed, "AT_BORDER", 44.2167, 80.3833);
  await st(aDriver, oClosed, "CUSTOMS");
  await st(aDriver, oClosed, "BORDER_CLEARED", 44.2, 80.35);
  await st(aDriver, oClosed, "IN_TRANSIT");
  await addLocation(aDriver, oClosed, { latitude: 43.2389, longitude: 76.8897, accuracy: 40, note: "Алматы, отдых", recordedAt: null });
  await st(aDriver, oClosed, "AT_DELIVERY", 55.7558, 37.6173);
  const pod = await uploadOrderDocument(aDriver, oClosed, {
    type: "PROOF_OF_DELIVERY",
    file: file(
      await makePdf("CMR / POD (DEMO)", ["Consignee signature: DEMO", "Received without remarks"]),
      "cmr-signed.pdf",
      "application/pdf",
    ),
  });
  await reportDelivered(aDriver, oClosed, {
    comment: "Выгружено без замечаний",
    documentIds: [pod.id],
    latitude: 55.7558,
    longitude: 37.6173,
    accuracy: 20,
  });
  await confirmDelivery(aShipper, oClosed, "Груз получен в полном объёме");
  const finalPay = await prisma.paymentRecord.findFirst({ where: { orderId: oClosed, type: "FINAL_PAYMENT" } });
  if (finalPay) await prisma.paymentRecord.update({ where: { id: finalPay.id }, data: { status: "PAID", paidAt: new Date() } });
  await createReview(aShipper, oClosed, {
    rating: 5,
    punctuality: 5,
    communication: 5,
    documentation: 4,
    comment: "Отличная работа, машина пришла вовремя.",
  });
  await createReview(aCarrier, oClosed, {
    rating: 5,
    punctuality: 5,
    communication: 4,
    documentation: 5,
    comment: "Чёткая погрузка, оплата без задержек.",
  });
  await shiftOrderToPast(oClosed, 30);

  // ───────── Перевозка в пути (MAN + Нурлан) ─────────
  console.log("→ Перевозка в пути");
  const lTransit = await createLoad(
    aShipper,
    loadInput({
      title: "Оборудование: промышленные насосы",
      cargoType: "EQUIPMENT",
      cargoDescription: "Насосы на паллетах, не штабелировать",
      weightKg: 18000,
      volumeM3: 70,
      targetPrice: 4600,
      stops: ROUTE_CN_ALA_MSK(1),
    }),
    { publish: true },
  );
  const oTransit = await runOrderToSigned(aShipper, aCarrier, lTransit, 4500);
  await createPayment(aCarrier, oTransit, {
    type: "PREPAYMENT",
    amount: 1500,
    currency: "USD",
    status: "PAID",
    dueDate: null,
    paidAt: null,
    note: "Предоплата 30%",
  });
  await assignVehicle(aCarrier, oTransit, man.id);
  await assignDriver(aCarrier, oTransit, driver2.id);
  await st(aDriver2, oTransit, "AT_LOADING", 43.8256, 87.6168);
  await uploadOrderDocument(aDriver2, oTransit, { type: "SEAL_PHOTO", file: file(PNG_1PX, "seal.png", "image/png") });
  await uploadOrderDocument(aCarrier, oTransit, {
    type: "CMR",
    file: file(
      await makePdf("CMR (DEMO)", ["Sender: Demo Cargo Kazakhstan", "Carrier: Demo Trans Logistics"]),
      "cmr.pdf",
      "application/pdf",
    ),
  });
  await uploadOrderDocument(aShipper, oTransit, {
    type: "INVOICE",
    file: file(await makePdf("Commercial invoice (DEMO)", ["Pumps x 24"]), "invoice.pdf", "application/pdf"),
  });
  await st(aDriver2, oTransit, "LOADED", 43.8256, 87.6168);
  await st(aDriver2, oTransit, "IN_TRANSIT", 43.83, 87.6);
  await st(aDriver2, oTransit, "AT_BORDER", 44.2167, 80.3833);
  await st(aDriver2, oTransit, "CUSTOMS");
  await st(aDriver2, oTransit, "BORDER_CLEARED");
  await st(aDriver2, oTransit, "IN_TRANSIT");
  await addLocation(aDriver2, oTransit, { latitude: 43.3, longitude: 77.2, accuracy: 35, note: null, recordedAt: null });
  await sendMessage(aShipper, oTransit, { message: "Добрый день! Подскажите ориентировочное время прибытия в Москву?" });
  await sendMessage(aCarrier, oTransit, { message: "Здравствуйте! Машина прошла границу, ожидаем прибытие через 6 дней." });
  await sendMessage(aDriver2, oTransit, { message: "Прошёл Хоргос, двигаюсь на Алматы." });
  await shiftOrderToPast(oTransit, 4);
  await addLocation(aDriver2, oTransit, { latitude: 50.28, longitude: 57.17, accuracy: 30, note: "Актобе", recordedAt: null });

  // ───────── Безопасная сделка: Китай → Алматы, выплачено перевозчику (Volvo + Demo Driver) ─────────
  console.log("→ Безопасная сделка: завершена и выплачена");
  const CN_ALA = (start: number): LoadInput["stops"] => [
    {
      type: "PICKUP",
      country: "CN",
      city: "Урумчи",
      fullAddress: "Урумчи, промзона Мидун, склад 12",
      plannedDateFrom: date(start, 1),
      plannedDateTo: date(start, 9),
    },
    { type: "BORDER", country: "KZ", city: "Хоргос", fullAddress: "МАПП Нуржолы", plannedDateFrom: date(start + 1) },
    {
      type: "DELIVERY",
      country: "KZ",
      city: "Алматы",
      fullAddress: "Алматы, терминал «Демо», рампа 5",
      plannedDateFrom: date(start + 2, 6),
    },
  ];
  const tripCnAla = async (orderId: string) => {
    await assignVehicle(aCarrier, orderId, volvo.id);
    await assignDriver(aCarrier, orderId, driver1.id);
    await st(aDriver, orderId, "AT_LOADING", 43.8256, 87.6168);
    await uploadOrderDocument(aDriver, orderId, { type: "CARGO_PHOTO", file: file(PNG_1PX, "cargo.png", "image/png") });
    await st(aDriver, orderId, "LOADED", 43.8256, 87.6168, "Пломба № DEMO-7730");
    await st(aDriver, orderId, "IN_TRANSIT", 43.83, 87.6);
    await st(aDriver, orderId, "AT_BORDER", 44.2167, 80.3833);
    await st(aDriver, orderId, "CUSTOMS");
    await st(aDriver, orderId, "BORDER_CLEARED", 44.2, 80.35);
    await st(aDriver, orderId, "IN_TRANSIT");
    await addLocation(aDriver, orderId, { latitude: 43.62, longitude: 77.95, accuracy: 30, note: "≈ 100 км до Алматы", recordedAt: null });
    await st(aDriver, orderId, "AT_DELIVERY", 43.2389, 76.8897);
    const cmr = await uploadOrderDocument(aDriver, orderId, {
      type: "PROOF_OF_DELIVERY",
      file: file(await makePdf("CMR / POD (DEMO)", ["Consignee: Demo Cargo Kazakhstan", "Received"]), "pod.pdf", "application/pdf"),
    });
    await reportDelivered(aDriver, orderId, {
      comment: "Выгружено, CMR подписана получателем",
      documentIds: [cmr.id],
      latitude: 43.2389,
      longitude: 76.8897,
      accuracy: 20,
    });
  };
  const lSecureDone = await createLoad(
    aShipper,
    loadInput({
      title: "Бытовая электроника (безопасная сделка)",
      cargoType: "ELECTRONICS",
      weightKg: 16000,
      targetPrice: 3000,
      stops: CN_ALA(1),
    }),
    { publish: true },
  );
  const oSecureDone = await runOrderToSigned(aShipper, aCarrier, lSecureDone, 3000);
  await initiateSecureDeal(aShipper, oSecureDone);
  await tripCnAla(oSecureDone);
  // Заказчик подтверждает получение → PAYMENT_RELEASE_PENDING → PAYMENT_RELEASED → CLOSED
  await confirmDelivery(aShipper, oSecureDone, "Получено, претензий нет");
  await createReview(aShipper, oSecureDone, {
    rating: 5,
    punctuality: 5,
    communication: 5,
    documentation: 5,
    comment: "Быстро и аккуратно.",
  });
  await shiftOrderToPast(oSecureDone, 12);

  // ───────── Безопасная сделка: Китай → Алматы, доставлено, ожидает подтверждения (оплата обеспечена) ─────────
  console.log("→ Безопасная сделка: доставлено, оплата в резерве");
  const lSecure = await createLoad(
    aShipper,
    loadInput({
      title: "Оборудование для склада (безопасная сделка)",
      cargoType: "EQUIPMENT",
      weightKg: 18000,
      targetPrice: 3000,
      stops: CN_ALA(1),
    }),
    { publish: true },
  );
  const oSecure = await runOrderToSigned(aShipper, aCarrier, lSecure, 3000);
  await initiateSecureDeal(aShipper, oSecure);
  await tripCnAla(oSecure);
  await sendMessage(aDriver, oSecure, { message: "Выгрузился в Алматы, CMR загрузил. Готов к следующему рейсу." });
  await shiftOrderToPast(oSecure, 1);

  // ───────── Активная перевозка: договор подписан, нужно назначить транспорт ─────────
  console.log("→ Активная перевозка (договор подписан)");
  const lActive = await createLoad(
    aShipper,
    loadInput({
      title: "Одежда: сезонная коллекция",
      cargoType: "CLOTHING",
      weightKg: 9000,
      volumeM3: 80,
      targetPrice: 3900,
      stops: [
        {
          type: "PICKUP",
          country: "CN",
          city: "Иу",
          fullAddress: "Иу, рынок Футянь, склад 7",
          plannedDateFrom: date(6, 1),
          plannedDateTo: date(6, 8),
        },
        { type: "DELIVERY", country: "KZ", city: "Алматы", fullAddress: "Алматы, ТЦ «Демо», рампа 3", plannedDateFrom: date(13, 4) },
      ],
    }),
    { publish: true },
  );
  await runOrderToSigned(aShipper, aCarrier, lActive, 3800);

  // ───────── Экспедитор: договор ожидает подписи перевозчика ─────────
  console.log("→ Сделка экспедитора");
  const lFwd = await createLoad(
    aForwarder,
    loadInput({
      title: "Автозапчасти для клиента",
      clientName: "ООО «Демо Авто» (клиент экспедитора)",
      cargoType: "AUTOMOTIVE",
      weightKg: 12000,
      targetPrice: 5200,
      stops: [
        { type: "PICKUP", country: "CN", city: "Шанхай", fullAddress: "Шанхай, порт Янпшань, склад 3", plannedDateFrom: date(8, 1) },
        { type: "BORDER", country: "KZ", city: "Хоргос", plannedDateFrom: date(14) },
        { type: "DELIVERY", country: "RU", city: "Москва", fullAddress: "Москва, ул. Складская, 5", plannedDateFrom: date(22, 6) },
      ],
    }),
    { publish: true },
  );
  const fwdBid = await createBid(aCarrier, lFwd.id, {
    amount: 5400,
    currency: "USD",
    comment: "Тент 86 м³, GPS",
    readyDate: null,
    terms: null,
    validUntil: null,
  });
  await counterBid(aForwarder, fwdBid.id, 5100, "Готовы на 5 100 USD");
  await respondToCounter(aCarrier, fwdBid.id, { action: "propose", amount: 5250, message: "Можем 5 250 USD с учётом платных дорог" });
  const fwdAccepted = await acceptBid(aForwarder, fwdBid.id);
  const fwdContract = await prisma.contract.findUniqueOrThrow({ where: { id: fwdAccepted.contractId } });
  await signContract(aForwarder, fwdContract.id, { password: DEMO_PASSWORD, documentHash: fwdContract.contentHash });

  // ───────── Спор (второй перевозчик) ─────────
  console.log("→ Перевозка со спором");
  const lDispute = await createLoad(
    aForwarder,
    loadInput({
      title: "Продукты питания (сухие)",
      cargoType: "FOOD",
      weightKg: 16000,
      targetPrice: 2800,
      stops: [
        { type: "PICKUP", country: "KZ", city: "Алматы", plannedDateFrom: date(1, 3) },
        { type: "DELIVERY", country: "CN", city: "Урумчи", plannedDateFrom: date(5, 3) },
      ],
    }),
    { publish: true },
  );
  const oDispute = await runOrderToSigned(aForwarder, aCarrier2, lDispute, 2700);
  // Оплата обеспечена безопасной сделкой — спор замораживает выплату
  await initiateSecureDeal(aForwarder, oDispute);
  await assignVehicle(aCarrier2, oDispute, scania2.id);
  await assignDriver(aCarrier2, oDispute, cnDriver.id);
  await st(aCnDriver, oDispute, "AT_LOADING");
  await st(aCnDriver, oDispute, "LOADED");
  await st(aCnDriver, oDispute, "IN_TRANSIT", 43.5, 78.5);
  await openDispute(aForwarder, oDispute, {
    reason: "DELAY",
    description: "Машина задерживается на 2 суток относительно согласованного графика, водитель не выходит на связь.",
  });
  await shiftOrderToPast(oDispute, 3);

  // ───────── Опубликованные грузы на бирже ─────────
  console.log("→ Грузы на бирже");
  const lOpen1 = await createLoad(
    aShipper,
    loadInput({
      title: "Бытовая техника",
      cargoType: "ELECTRONICS",
      weightKg: 20000,
      targetPrice: 4500,
      requirements: "Ремни, 2 крепления на паллету",
      stops: ROUTE_CN_ALA_MSK(7),
    }),
    { publish: true },
  );
  await createBid(aCarrier2, lOpen1.id, {
    amount: 4400,
    currency: "USD",
    comment: "Машина в Урумчи, подача за сутки",
    readyDate: new Date(date(6)),
    terms: null,
    validUntil: new Date(date(6)),
  });
  await createLoad(
    aShipper,
    loadInput({
      title: "Керамическая плитка",
      cargoType: "GENERAL",
      weightKg: 21000,
      volumeM3: 40,
      priceType: "REQUEST_QUOTE",
      targetPrice: null,
      stops: [
        { type: "PICKUP", country: "CN", city: "Гуанчжоу", plannedDateFrom: date(10, 2) },
        { type: "DELIVERY", country: "RU", city: "Москва", plannedDateFrom: date(24, 6) },
      ],
    }),
    { publish: true },
  );
  await createLoad(
    aForwarder,
    loadInput({
      title: "Станки ЧПУ",
      cargoType: "EQUIPMENT",
      weightKg: 17500,
      targetPrice: 3100,
      currency: "USD",
      stops: [
        { type: "PICKUP", country: "RU", city: "Москва", plannedDateFrom: date(5, 6) },
        { type: "DELIVERY", country: "KZ", city: "Астана", plannedDateFrom: date(10, 6) },
      ],
    }),
    { publish: true },
  );
  await createLoad(
    aShipper,
    loadInput({
      title: "Зерно в биг-бэгах",
      cargoType: "FOOD",
      weightKg: 20000,
      targetPrice: 12500000,
      currency: "KZT",
      priceType: "FIXED",
      stops: [
        { type: "PICKUP", country: "KZ", city: "Костанай", plannedDateFrom: date(4, 3) },
        { type: "DELIVERY", country: "CN", city: "Урумчи", plannedDateFrom: date(9, 3) },
      ],
    }),
    { publish: true },
  );
  // ───────── Next Load: грузы из Алматы в разные стороны (автомобиль KZ 123 AB свободен в Алматы) ─────────
  console.log("→ Грузы для следующего рейса из Алматы");
  const nextLoads: {
    title: string;
    cargoType: LoadInput["cargoType"];
    weightKg: number;
    price: number;
    from: [string, string];
    to: [string, string];
    body?: LoadInput["bodyType"];
    by?: Actor;
    d: number;
  }[] = [
    { title: "Стройматериалы", cargoType: "GENERAL", weightKg: 18000, price: 1200, from: ["KZ", "Алматы"], to: ["KZ", "Астана"], d: 1 },
    { title: "Сухофрукты и орехи", cargoType: "FOOD", weightKg: 16000, price: 4300, from: ["KZ", "Алматы"], to: ["RU", "Москва"], d: 1 },
    { title: "Металлопрокат", cargoType: "GENERAL", weightKg: 20000, price: 2600, from: ["KZ", "Алматы"], to: ["RU", "Челябинск"], d: 2 },
    {
      title: "Бытовая химия",
      cargoType: "GENERAL",
      weightKg: 9000,
      price: 650,
      from: ["KZ", "Алматы"],
      to: ["KG", "Бишкек"],
      d: 1,
      by: aForwarder,
    },
    { title: "Сельхозтехника", cargoType: "EQUIPMENT", weightKg: 15000, price: 3400, from: ["KZ", "Астана"], to: ["RU", "Москва"], d: 3 },
    {
      title: "Кондитерские изделия",
      cargoType: "FOOD",
      weightKg: 12000,
      price: 900,
      from: ["KZ", "Алматы"],
      to: ["UZ", "Ташкент"],
      body: "REFRIGERATOR",
      d: 2,
    },
  ];
  for (const n of nextLoads) {
    await createLoad(
      n.by ?? aShipper,
      loadInput({
        title: `${n.title}: ${n.from[1]} — ${n.to[1]}`,
        cargoType: n.cargoType,
        weightKg: n.weightKg,
        targetPrice: n.price,
        bodyType: n.body ?? "CURTAINSIDER",
        stops: [
          { type: "PICKUP", country: n.from[0], city: n.from[1], plannedDateFrom: date(n.d, 3), plannedDateTo: date(n.d + 2, 12) },
          { type: "DELIVERY", country: n.to[0], city: n.to[1], plannedDateFrom: date(n.d + 3, 6) },
        ],
      }),
      { publish: true },
    );
  }
  // Диспетчер планирует: после Алматы — в сторону Москвы
  await createMovement(aCarrier, {
    vehicleId: volvo.id,
    sourceOrderId: null,
    intent: "CITY",
    origin: null,
    destinations: [{ country: "RU", city: "Москва" }],
    allowedDeviationKm: 250,
    maxPickupDistanceKm: 300,
    availableFrom: null,
    availableUntil: null,
    note: "Водитель готов ехать в сторону Москвы",
  });

  // Черновик
  await createLoad(
    aShipper,
    loadInput({
      title: "Черновик: текстиль",
      cargoType: "CLOTHING",
      weightKg: 5000,
      stops: [
        { type: "PICKUP", country: "UZ", city: "Ташкент", plannedDateFrom: date(15, 3) },
        { type: "DELIVERY", country: "KZ", city: "Алматы", plannedDateFrom: date(17, 3) },
      ],
    }),
    { publish: false },
  );

  // ───────── Fleet Fuel Control: ABC Logistics ─────────
  console.log("→ Топливо: ABC Logistics, MAN TGX, рейс Алматы → Москва");
  await seedFuelDemo({
    shipper: aShipper,
    password: DEMO_PASSWORD,
    createUser: (email, firstName, lastName, phone) => user(email, firstName, lastName, phone),
    shiftOrderToPast,
    meta: META,
  });

  // Уведомления seed-процесса помечаем прочитанными, чтобы не шуметь при первом входе
  await prisma.notification.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 60_000) } }, data: { readAt: new Date() } });

  console.log("\n✓ Демо-данные созданы. Пароль демо-аккаунтов:", DEMO_PASSWORD, "· администратор:", adminPassword.note);
  console.table([
    { role: "SHIPPER", email: "shipper@cargoflow.demo", company: "Demo Cargo Kazakhstan" },
    { role: "CARRIER_ADMIN", email: "carrier@cargoflow.demo", company: "Demo Trans Logistics" },
    { role: "CARRIER_DISPATCHER", email: "dispatcher@cargoflow.demo", company: "Demo Trans Logistics" },
    { role: "FORWARDER", email: "forwarder@cargoflow.demo", company: "Demo Forwarding" },
    { role: "DRIVER (доставил в Алматы)", email: "driver@cargoflow.demo", company: "Demo Trans Logistics" },
    { role: "DRIVER (в рейсе)", email: "driver2@cargoflow.demo", company: "Demo Trans Logistics" },
    { role: "CARRIER_ADMIN", email: "carrier2@cargoflow.demo", company: "Demo Silk Road Carriers" },
    { role: "CARRIER_ADMIN (топливо)", email: "fleet@cargoflow.demo", company: "ABC Logistics" },
    { role: "DRIVER (топливо)", email: "ivan@cargoflow.demo", company: "ABC Logistics" },
    { role: "PLATFORM_ADMIN", email: "admin@cargoflow.demo", company: "—" },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
