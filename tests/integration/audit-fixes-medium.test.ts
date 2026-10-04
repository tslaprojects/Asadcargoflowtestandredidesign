import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { manualProvider, sandboxProvider, setPaymentProviderOverride, type PaymentProvider } from "@/lib/payments/provider";
import { acceptBid, createBid } from "@/server/services/bid.service";
import { getCompanyProfile, updateMember } from "@/server/services/company.service";
import { signContract } from "@/server/services/contract.service";
import { openDispute, updateDispute } from "@/server/services/dispute.service";
import { deleteOrderDocument, uploadOrderDocument } from "@/server/services/document.service";
import { createLoad, getLoadDetail } from "@/server/services/load.service";
import { assignDriver, assignVehicle, cancelOrder, changeStatus, getOrderDetail, reportDelivered } from "@/server/services/order.service";
import { createPayment } from "@/server/services/payment.service";
import { adminConfirmTransaction, initiateSecureDeal, processConfirmationTimeouts } from "@/server/services/secure-deal.service";
import { actorFor, expectAppError, loadInput, makeCompany, makeUser, PASSWORD, pdfFile, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;
const DAY = 24 * 60 * 60_000;
const bidInput = (amount = 3000) => ({ amount, currency: "USD" as const, comment: null, readyDate: null, terms: null, validUntil: null });

async function newOrder(s: Scene) {
  const load = await createLoad(s.shipper, loadInput(), { publish: true });
  const bid = await createBid(s.carrier, load.id, bidInput());
  const res = await acceptBid(s.shipper, bid.id);
  return { ...res, loadId: load.id, bidId: bid.id };
}

async function sign(s: Scene, contractId: string) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  await signContract(s.shipper, contractId, { password: PASSWORD, documentHash: c.contentHash });
  await signContract(s.carrier, contractId, { password: PASSWORD, documentHash: c.contentHash });
}

async function toDelivered(s: Scene, orderId: string) {
  await assignVehicle(s.carrier, orderId, s.vehicle.id);
  await assignDriver(s.carrier, orderId, s.driver.id);
  for (const status of ["AT_LOADING", "LOADED", "IN_TRANSIT", "AT_DELIVERY"] as const) {
    await changeStatus(s.driverActor, orderId, { status, comment: null, documentIds: [] });
  }
  const pod = await uploadOrderDocument(s.driverActor, orderId, { type: "PROOF_OF_DELIVERY", file: pdfFile("pod.pdf") });
  await reportDelivered(s.driverActor, orderId, { comment: null, documentIds: [pod.id] });
  return pod.id;
}

describe("Исправления аудита: MEDIUM", () => {
  let s: Scene;
  beforeEach(async () => {
    await resetDb();
    s = await scene();
  });
  afterEach(() => setPaymentProviderOverride(null));

  it("AUTHZ-002: водитель не видит цену груза, условия и сумму в истории", async () => {
    const { orderId, contractId } = await newOrder(s);
    await sign(s, contractId);
    await assignVehicle(s.carrier, orderId, s.vehicle.id);
    await assignDriver(s.carrier, orderId, s.driver.id);
    const d = await getOrderDetail(s.driverActor, orderId);
    expect(d.order.load.targetPrice).toBeNull();
    expect(d.order.agreedAmount).toBeNull();
    expect(JSON.stringify(d.order.statusHistory)).not.toMatch(/3\s?000|USD|\$/);
  });

  it("AUTHZ-004: водитель не получает профиль компании (сотрудники, документы)", async () => {
    await expectAppError(getCompanyProfile(s.driverActor, s.carrierCo.id), "FORBIDDEN");
    const p = await getCompanyProfile(s.carrier, s.carrierCo.id);
    expect(p.company.id).toBe(s.carrierCo.id);
  });

  it("AUTHZ-005: основателя компании нельзя отключить, пока это не сделал администратор", async () => {
    const second = await makeUser({ role: "SHIPPER", companyId: s.shipperCo.id });
    const founder = await prisma.companyMember.findFirstOrThrow({ where: { companyId: s.shipperCo.id }, orderBy: { createdAt: "asc" } });
    await expectAppError(updateMember(await actorFor(second.id, s.shipperCo.id), founder.id, { status: "DISABLED" }), "FORBIDDEN");
  });

  it("BIZ-004: отказ перевозчика до подписания выставляет груз заказчика заново", async () => {
    const { orderId, loadId } = await newOrder(s);
    await cancelOrder(s.carrier, orderId, "Нет свободной машины");
    const copy = await prisma.load.findFirstOrThrow({ where: { companyId: s.shipperCo.id, id: { not: loadId } } });
    expect(copy.status).toBe("PUBLISHED");
    expect((await prisma.load.findUniqueOrThrow({ where: { id: loadId } })).status).toBe("CANCELLED");
  });

  it("BIZ-008: во время спора документы перевозки не удаляются", async () => {
    const { orderId, contractId } = await newOrder(s);
    await sign(s, contractId);
    const doc = await uploadOrderDocument(s.carrier, orderId, { type: "INVOICE", file: pdfFile("inv.pdf") });
    await openDispute(s.shipper, orderId, { reason: "DELAY", description: "Машина не подана вовремя" });
    await expectAppError(deleteOrderDocument(s.carrier, doc.id), "DOCUMENT_NOT_ALLOWED");
  });

  it("BIZ-014: заказчик не может сам отметить платёж оплаченным", async () => {
    const { orderId, contractId } = await newOrder(s);
    await sign(s, contractId);
    const base = { type: "PREPAYMENT" as const, amount: 500, currency: "USD" as const, dueDate: null, paidAt: null, note: null };
    await expectAppError(createPayment(s.shipper, orderId, { ...base, status: "PAID" }), "FORBIDDEN");
    const p = await createPayment(s.carrier, orderId, { ...base, status: "PAID" });
    expect(p.status).toBe("PAID");
  });

  it("SEC-013: сделка между компаниями с общим пользователем запрещена", async () => {
    const shipper2 = await makeCompany("SHIPPER");
    const both = await makeUser({ role: "SHIPPER", companyId: shipper2.id });
    await prisma.companyMember.create({ data: { companyId: s.carrierCo.id, userId: both.id, role: "CARRIER_ADMIN" } });
    const load = await createLoad(await actorFor(both.id, shipper2.id), loadInput(), { publish: true });
    await expectAppError(createBid(s.carrier, load.id, bidInput()), "FORBIDDEN");
  });

  it("BIZ-003: истёкшая ставка закрывается, груз снова открыт для редактирования", async () => {
    const load = await createLoad(s.shipper, loadInput(), { publish: true });
    const bid = await createBid(s.carrier, load.id, { ...bidInput(), validUntil: new Date(Date.now() + 60_000) });
    await prisma.bid.update({ where: { id: bid.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    await getLoadDetail(s.shipper, load.id);
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).status).toBe("EXPIRED");
    expect((await prisma.load.findUniqueOrThrow({ where: { id: load.id } })).status).toBe("PUBLISHED");
  });

  it("PAY-002: резерв, подтверждённый после доставки, запускает срок проверки", async () => {
    setPaymentProviderOverride(manualProvider);
    const { orderId, contractId } = await newOrder(s);
    await sign(s, contractId);
    await initiateSecureDeal(s.shipper, orderId);
    await toDelivered(s, orderId);
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).confirmationDueAt).toBeNull();
    const op = await prisma.paymentTransaction.findFirstOrThrow({ where: { payment: { orderId }, status: "PENDING" } });
    await adminConfirmTransaction(s.admin, op.id, { outcome: "SUCCEEDED", providerTransactionId: "PP-1", failureReason: null });
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).confirmationDueAt).not.toBeNull();
  });

  it("PAY-004/005: решение по спору доисполняется после сбоя провайдера", async () => {
    let failing = true;
    const flaky: PaymentProvider = {
      ...sandboxProvider,
      async execute(req) {
        if (failing && req.kind === "REFUND") throw new Error("network down");
        return sandboxProvider.execute(req);
      },
    };
    setPaymentProviderOverride(flaky);
    const { orderId, contractId } = await newOrder(s);
    await sign(s, contractId);
    await initiateSecureDeal(s.shipper, orderId);
    const dispute = await openDispute(s.shipper, orderId, { reason: "NOT_DELIVERED", description: "Перевозчик отказался от рейса" });
    await updateDispute(s.admin, dispute.id, {
      status: "RESOLVED",
      resolution: "Перевозка отменена, деньги заказчику",
      orderOutcome: "CANCEL",
      paymentOutcome: "REFUND_FULL",
    });
    let p = await prisma.paymentRecord.findFirstOrThrow({ where: { orderId, type: "SECURE_DEAL" } });
    expect(p.status).toBe("PAYMENT_DISPUTED");
    failing = false;
    // Зависшая операция старше 10 минут переотправляется плановой задачей с тем же ключом
    await prisma.paymentTransaction.updateMany({
      where: { paymentId: p.id, status: "PENDING" },
      data: { createdAt: new Date(Date.now() - DAY) },
    });
    await processConfirmationTimeouts(new Date());
    p = await prisma.paymentRecord.findUniqueOrThrow({ where: { id: p.id } });
    expect(p.status).toBe("PAYMENT_REFUNDED");
    expect(Number(p.refundedAmount)).toBe(3000);
  });

  it("BIZ-002: ставка — только в валюте груза", async () => {
    const load = await createLoad(s.shipper, loadInput(), { publish: true });
    await expectAppError(createBid(s.carrier, load.id, { ...bidInput(), currency: "KZT" }), "VALIDATION_ERROR");
  });
});
