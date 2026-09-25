import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { acceptBid, createBid, withdrawBid } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import { deleteOrderDocument, getDocumentForDownload, uploadOrderDocument } from "@/server/services/document.service";
import { openDispute, updateDispute } from "@/server/services/dispute.service";
import { cancelLoad, createLoad, getLoadDetail, listLoads, publishLoad } from "@/server/services/load.service";
import { assignDriver, assignVehicle, cancelOrder, changeStatus, getOrderDetail, listOrders } from "@/server/services/order.service";
import { createPayment } from "@/server/services/payment.service";
import { updateSettings, DEFAULT_SETTINGS } from "@/server/services/settings.service";
import { addLocation } from "@/server/services/tracking.service";
import { loadListQuerySchema } from "@/lib/validation/load";
import { orderListQuerySchema } from "@/lib/validation/order";
import { expectAppError, loadInput, makeCompany, makeUser, actorFor, PASSWORD, pdfFile, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;

async function publishedLoad(s: Scene, over = {}) {
  return createLoad(s.shipper, loadInput(over), { publish: true });
}

async function signedOrder(s: Scene) {
  const load = await publishedLoad(s);
  const bid = await createBid(s.carrier, load.id, {
    amount: 4200,
    currency: "USD",
    comment: null,
    readyDate: null,
    terms: null,
    validUntil: null,
  });
  const { orderId, contractId } = await acceptBid(s.shipper, bid.id);
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  await signContract(s.shipper, contractId, { password: PASSWORD, documentHash: c.contentHash });
  await signContract(s.carrier, contractId, { password: PASSWORD, documentHash: c.contentHash });
  return { orderId, loadId: load.id, bidId: bid.id };
}

describe("RBAC на уровне сервисов", () => {
  let s: Scene;
  beforeEach(async () => {
    await resetDb();
    s = await scene();
  });

  it("перевозчик не может создавать грузы, грузовладелец — ставки", async () => {
    await expectAppError(createLoad(s.carrier, loadInput(), { publish: true }), "FORBIDDEN");
    const load = await publishedLoad(s);
    await expectAppError(
      createBid(s.shipper, load.id, { amount: 1, currency: "USD", comment: null, readyDate: null, terms: null, validUntil: null }),
      "FORBIDDEN",
    );
  });

  it("водитель не имеет доступа к бирже грузов (403)", async () => {
    await publishedLoad(s);
    const err = await expectAppError(listLoads(s.driverActor, loadListQuerySchema.parse({ scope: "marketplace" })), "FORBIDDEN");
    expect(err.status).toBe(403);
  });

  it("грузовладелец не может назначить автомобиль (403)", async () => {
    const { orderId } = await signedOrder(s);
    const err = await expectAppError(assignVehicle(s.shipper, orderId, s.vehicle.id), "FORBIDDEN");
    expect(err.status).toBe(403);
  });

  it("посторонняя компания не видит сделку и документы", async () => {
    const { orderId } = await signedOrder(s);
    const doc = await uploadOrderDocument(s.shipper, orderId, { type: "INVOICE", file: pdfFile("invoice.pdf") });
    await expectAppError(getOrderDetail(s.carrier2, orderId), "FORBIDDEN");
    await expectAppError(getDocumentForDownload(s.carrier2, doc.id), "FORBIDDEN");
    const list = await listOrders(s.carrier2, orderListQuerySchema.parse({}));
    expect(list.total).toBe(0);
  });

  it("черновик не виден на бирже и недоступен перевозчику", async () => {
    const draft = await createLoad(s.shipper, loadInput(), { publish: false });
    const market = await listLoads(s.carrier, loadListQuerySchema.parse({ scope: "marketplace" }));
    expect(market.items.find((l) => l.id === draft.id)).toBeUndefined();
    await expectAppError(getLoadDetail(s.carrier, draft.id), "NOT_FOUND");
  });

  it("груз «только для приглашённых» виден только приглашённым", async () => {
    const load = await createLoad(s.shipper, loadInput({ visibility: "INVITE_ONLY", invitedCarrierIds: [s.carrierCo.id] }), {
      publish: true,
    });
    const forInvited = await listLoads(s.carrier, loadListQuerySchema.parse({ scope: "marketplace" }));
    const forOther = await listLoads(s.carrier2, loadListQuerySchema.parse({ scope: "marketplace" }));
    expect(forInvited.items.some((l) => l.id === load.id)).toBe(true);
    expect(forOther.items.some((l) => l.id === load.id)).toBe(false);
  });

  it("водитель не видит финансы и договор, не может менять статус чужого рейса", async () => {
    const { orderId } = await signedOrder(s);
    await assignVehicle(s.carrier, orderId, s.vehicle.id);
    await assignDriver(s.carrier, orderId, s.driver.id);
    const detail = await getOrderDetail(s.driverActor, orderId);
    expect(detail.order.agreedAmount).toBeNull();
    expect(detail.finance).toBeNull();
    expect(detail.contract).toBeNull();
    const invoice = await uploadOrderDocument(s.shipper, orderId, { type: "INVOICE", file: pdfFile("inv.pdf") });
    await expectAppError(getDocumentForDownload(s.driverActor, invoice.id), "FORBIDDEN");
    await expectAppError(
      createPayment(s.driverActor, orderId, {
        type: "OTHER",
        amount: 1,
        currency: "USD",
        status: "PLANNED",
        dueDate: null,
        paidAt: null,
        note: null,
      }),
      "FORBIDDEN",
    );

    // Другой водитель той же компании (не назначенный) не имеет доступа
    const otherDriverUser = await makeUser({ role: "DRIVER", companyId: s.carrierCo.id });
    const otherDriver = await actorFor(otherDriverUser.id, s.carrierCo.id);
    await expectAppError(changeStatus(otherDriver, orderId, { status: "AT_LOADING", comment: null, documentIds: [] }), "FORBIDDEN");
    await expectAppError(
      addLocation(otherDriver, orderId, { latitude: 1, longitude: 1, accuracy: null, note: null, recordedAt: null }),
      "FORBIDDEN",
    );
  });

  it("заблокированная (приостановленная) компания — только просмотр", async () => {
    await prisma.company.update({ where: { id: s.carrierCo.id }, data: { verificationStatus: "SUSPENDED" } });
    const suspended = await actorFor(s.carrier.userId, s.carrierCo.id);
    const load = await publishedLoad(s);
    await expectAppError(
      createBid(suspended, load.id, { amount: 10, currency: "USD", comment: null, readyDate: null, terms: null, validUntil: null }),
      "FORBIDDEN",
    );
  });
});

describe("конкурентность и идемпотентность", () => {
  let s: Scene;
  beforeEach(async () => {
    await resetDb();
    s = await scene();
  });

  it("одновременное принятие двух разных ставок создаёт только одну перевозку", async () => {
    const load = await publishedLoad(s);
    const b1 = await createBid(s.carrier, load.id, {
      amount: 4200,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const b2 = await createBid(s.carrier2, load.id, {
      amount: 4300,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const results = await Promise.allSettled([acceptBid(s.shipper, b1.id), acceptBid(s.shipper, b2.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(["LOAD_ALREADY_CONVERTED", "INVALID_STATE_TRANSITION", "BID_ALREADY_ACCEPTED"]).toContain(rejected.reason.code);
    expect(await prisma.transportOrder.count({ where: { loadId: load.id } })).toBe(1);
    expect(await prisma.bid.count({ where: { loadId: load.id, status: "ACCEPTED" } })).toBe(1);
  });

  it("двойной клик «Принять предложение» не создаёт дубль", async () => {
    const load = await publishedLoad(s);
    const b = await createBid(s.carrier, load.id, {
      amount: 4200,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const results = await Promise.allSettled([acceptBid(s.shipper, b.id), acceptBid(s.shipper, b.id), acceptBid(s.shipper, b.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.transportOrder.count({ where: { loadId: load.id } })).toBe(1);
    expect(await prisma.contract.count()).toBe(1);
  });

  it("параллельные ставки одного перевозчика — одна активная (уникальный индекс)", async () => {
    const load = await publishedLoad(s);
    const input = { amount: 4000, currency: "USD" as const, comment: null, readyDate: null, terms: null, validUntil: null };
    const results = await Promise.allSettled([createBid(s.carrier, load.id, input), createBid(s.carrier, load.id, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.bid.count({ where: { loadId: load.id, status: "PENDING" } })).toBe(1);
  });

  it("повторная смена статуса не создаёт дубль в истории", async () => {
    const { orderId } = await signedOrder(s);
    await assignVehicle(s.carrier, orderId, s.vehicle.id);
    await assignDriver(s.carrier, orderId, s.driver.id);
    const input = { status: "AT_LOADING" as const, comment: null, documentIds: [] };
    const results = await Promise.allSettled([changeStatus(s.driverActor, orderId, input), changeStatus(s.driverActor, orderId, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.transportOrderStatusHistory.count({ where: { orderId, toStatus: "AT_LOADING" } })).toBe(1);
  });
});

describe("бизнес-правила", () => {
  let s: Scene;
  beforeEach(async () => {
    await resetDb();
    s = await scene();
  });

  it("нельзя принять ставку по отменённому грузу; отмена отклоняет ставки", async () => {
    const load = await publishedLoad(s);
    const b = await createBid(s.carrier, load.id, {
      amount: 4200,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    await cancelLoad(s.shipper, load.id, "Передумали");
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("REJECTED");
    await expectAppError(acceptBid(s.shipper, b.id), "INVALID_STATE_TRANSITION");
  });

  it("отозванную ставку принять нельзя, можно отправить новую", async () => {
    const load = await publishedLoad(s);
    const b = await createBid(s.carrier, load.id, {
      amount: 4200,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    await withdrawBid(s.carrier, b.id);
    await expectAppError(acceptBid(s.shipper, b.id), "INVALID_STATE_TRANSITION");
    await createBid(s.carrier, load.id, { amount: 4100, currency: "USD", comment: null, readyDate: null, terms: null, validUntil: null });
  });

  it("просроченная ставка не принимается", async () => {
    const load = await publishedLoad(s);
    const b = await createBid(s.carrier, load.id, {
      amount: 4200,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: new Date(Date.now() + 60_000),
    });
    await prisma.bid.update({ where: { id: b.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    await expectAppError(acceptBid(s.shipper, b.id), "INVALID_STATE_TRANSITION");
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("EXPIRED");
  });

  it("после подписания договора сторона не может отменить перевозку; до — может", async () => {
    const { orderId } = await signedOrder(s);
    const err = await expectAppError(cancelOrder(s.shipper, orderId, "Причина"), "INVALID_STATE_TRANSITION");
    expect((err as unknown as Error).message).toContain("спора/администратора");
    await cancelOrder(s.admin, orderId, "Решение администратора");
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("CANCELLED");

    const load2 = await publishedLoad(s);
    const b2 = await createBid(s.carrier, load2.id, {
      amount: 1000,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const { orderId: o2 } = await acceptBid(s.shipper, b2.id);
    await cancelOrder(s.carrier, o2, "Нет машины");
    const contract = await prisma.contract.findFirstOrThrow({ where: { orderId: o2 } });
    expect(contract.status).toBe("CANCELLED");
  });

  it("водитель занят на пересекающемся рейсе", async () => {
    const a = await signedOrder(s);
    await assignVehicle(s.carrier, a.orderId, s.vehicle.id);
    await assignDriver(s.carrier, a.orderId, s.driver.id);
    const b = await signedOrder(s);
    const v2 = await prisma.vehicle.create({
      data: {
        companyId: s.carrierCo.id,
        plateNumber: "KZ 999 ZZ",
        country: "KZ",
        make: "MAN",
        model: "TGX",
        vehicleType: "TRACTOR_TRAILER",
        bodyType: "CURTAINSIDER",
        capacityKg: 22000,
      },
    });
    await expectAppError(assignVehicle(s.carrier, b.orderId, s.vehicle.id), "VEHICLE_UNAVAILABLE");
    await assignVehicle(s.carrier, b.orderId, v2.id);
    await expectAppError(assignDriver(s.carrier, b.orderId, s.driver.id), "DRIVER_UNAVAILABLE");
  });

  it("ограничение публикации по типу груза настраивается администратором", async () => {
    await updateSettings(s.admin, { ...DEFAULT_SETTINGS, restrictedCargoTypes: ["CHEMICAL"] });
    await expectAppError(createLoad(s.shipper, loadInput({ cargoType: "CHEMICAL" }), { publish: true }), "FORBIDDEN");
    await expectAppError(updateSettings(s.shipper, DEFAULT_SETTINGS), "FORBIDDEN");
  });

  it("проверка файлов: подмена содержимого отклоняется; удаление только своих документов", async () => {
    const { orderId } = await signedOrder(s);
    const fake = new File([new TextEncoder().encode("MZ executable")], "invoice.pdf", { type: "application/pdf" });
    await expectAppError(uploadOrderDocument(s.shipper, orderId, { type: "INVOICE", file: fake }), "DOCUMENT_NOT_ALLOWED");
    const exe = new File([new TextEncoder().encode("%PDF-")], "virus.exe", { type: "application/octet-stream" });
    await expectAppError(uploadOrderDocument(s.shipper, orderId, { type: "OTHER", file: exe }), "DOCUMENT_NOT_ALLOWED");
    const doc = await uploadOrderDocument(s.shipper, orderId, { type: "INVOICE", file: pdfFile() });
    await expectAppError(deleteOrderDocument(s.carrier, doc.id), "FORBIDDEN");
    await deleteOrderDocument(s.shipper, doc.id);
    expect((await prisma.orderDocument.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("DELETED");
    expect(await prisma.auditLog.count({ where: { action: "DOCUMENT_DELETED", entityId: doc.id } })).toBe(1);
  });

  it("новая версия документа заменяет предыдущую", async () => {
    const { orderId } = await signedOrder(s);
    const v1 = await uploadOrderDocument(s.carrier, orderId, { type: "CMR", file: pdfFile("cmr.pdf") });
    const v2 = await uploadOrderDocument(s.carrier, orderId, { type: "CMR", file: pdfFile("cmr-v2.pdf"), replacesId: v1.id });
    expect(v2.version).toBe(2);
    expect(v2.groupId).toBe(v1.groupId);
    expect((await prisma.orderDocument.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe("SUPERSEDED");
  });

  it("спор приостанавливает перевозку, администратор возобновляет", async () => {
    const { orderId } = await signedOrder(s);
    await openDispute(s.shipper, orderId, { reason: "DELAY", description: "Машина не подана вовремя" });
    await expectAppError(openDispute(s.carrier, orderId, { reason: "OTHER", description: "Второй спор по заказу" }), "DUPLICATE_ACTION");
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("DISPUTED");
    await expectAppError(assignVehicle(s.carrier, orderId, s.vehicle.id), "INVALID_STATE_TRANSITION");
    const dispute = await prisma.dispute.findFirstOrThrow({ where: { orderId } });
    await expectAppError(
      updateDispute(s.shipper, dispute.id, { status: "RESOLVED", resolution: "x", orderOutcome: "RESUME" }),
      "FORBIDDEN",
    );
    await updateDispute(s.admin, dispute.id, { status: "RESOLVED", resolution: "Перевозчик подаст машину завтра", orderOutcome: "RESUME" });
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("CONTRACT_SIGNED");
  });

  it("сумма платежей не может превышать стоимость; валюта — только валюта сделки", async () => {
    const { orderId } = await signedOrder(s);
    await createPayment(s.shipper, orderId, {
      type: "PREPAYMENT",
      amount: 4000,
      currency: "USD",
      status: "PAID",
      dueDate: null,
      paidAt: null,
      note: null,
    });
    await expectAppError(
      createPayment(s.shipper, orderId, {
        type: "OTHER",
        amount: 300,
        currency: "USD",
        status: "PLANNED",
        dueDate: null,
        paidAt: null,
        note: null,
      }),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      createPayment(s.shipper, orderId, {
        type: "OTHER",
        amount: 1,
        currency: "KZT",
        status: "PLANNED",
        dueDate: null,
        paidAt: null,
        note: null,
      }),
      "VALIDATION_ERROR",
    );
  });

  it("экспедитор создаёт груз от имени клиента и становится стороной сделки", async () => {
    const fwdCo = await makeCompany("FORWARDER", "Fwd LLP");
    const fwdUser = await makeUser({ role: "FORWARDER", companyId: fwdCo.id });
    const fwd = await actorFor(fwdUser.id, fwdCo.id);
    const load = await createLoad(fwd, loadInput({ clientName: "Клиент экспедитора" }), { publish: true });
    await expectAppError(publishLoad(fwd, load.id), "DUPLICATE_ACTION");
    const b = await createBid(s.carrier, load.id, {
      amount: 3000,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const { orderId } = await acceptBid(fwd, b.id);
    const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.forwarderCompanyId).toBe(fwdCo.id);
    expect(order.shipperCompanyId).toBe(fwdCo.id);
  });
});
