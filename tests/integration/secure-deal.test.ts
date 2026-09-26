import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { manualProvider, setPaymentProviderOverride, type PaymentProvider } from "@/lib/payments/provider";
import { acceptBid, createBid } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import { openDispute, updateDispute } from "@/server/services/dispute.service";
import { uploadOrderDocument } from "@/server/services/document.service";
import { createLoad } from "@/server/services/load.service";
import { createMovement, getMovementMatches } from "@/server/services/next-load.service";
import { assignDriver, assignVehicle, cancelOrder, changeStatus, confirmDelivery, reportDelivered } from "@/server/services/order.service";
import { createPayment, updatePayment } from "@/server/services/payment.service";
import {
  adminConfirmTransaction,
  adminRelease,
  adminRefund,
  cancelSecureDeal,
  getSecureDealView,
  handleProviderWebhook,
  initiateSecureDeal,
  processConfirmationTimeouts,
  requestOperation,
} from "@/server/services/secure-deal.service";
import { expectAppError, loadInput, PASSWORD, pdfFile, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;
const DAY = 24 * 60 * 60_000;

async function setSetting(key: string, value: unknown) {
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}

/** Китай → Алматы за $3 000 (сценарий из ТЗ). */
function chinaAlmaty(over: Record<string, unknown> = {}) {
  return loadInput({
    title: "Оборудование Урумчи — Алматы",
    weightKg: 18000,
    targetPrice: 3000,
    stops: [
      { type: "PICKUP", country: "CN", city: "Урумчи", plannedDateFrom: new Date(Date.now() + DAY).toISOString() },
      { type: "DELIVERY", country: "KZ", city: "Алматы", plannedDateFrom: new Date(Date.now() + 4 * DAY).toISOString() },
    ],
    ...over,
  } as never);
}

async function newOrder(s: Scene, amount = 3000) {
  const load = await createLoad(s.shipper, chinaAlmaty(), { publish: true });
  const bid = await createBid(s.carrier, load.id, {
    amount,
    currency: "USD",
    comment: null,
    readyDate: null,
    terms: null,
    validUntil: null,
  });
  const res = await acceptBid(s.shipper, bid.id);
  return { orderId: res.orderId, contractId: res.contractId, loadId: load.id };
}

async function sign(s: Scene, contractId: string) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  await signContract(s.shipper, contractId, { password: PASSWORD, documentHash: c.contentHash });
  await signContract(s.carrier, contractId, { password: PASSWORD, documentHash: c.contentHash });
}

let plate = 0;
/** Отдельный автомобиль на каждый рейс, чтобы тесты не зависели друг от друга. */
async function freshVehicle(s: Scene) {
  plate += 1;
  return prisma.vehicle.create({
    data: {
      companyId: s.carrierCo.id,
      plateNumber: `SD ${plate} KZ`,
      country: "KZ",
      make: "MAN",
      model: "TGX",
      vehicleType: "TRACTOR_TRAILER",
      bodyType: "CURTAINSIDER",
      capacityKg: 22000,
      gpsEnabled: true,
    },
  });
}

async function driveToDelivered(s: Scene, orderId: string, opts: { pod?: boolean; vehicleId?: string } = { pod: true }) {
  await assignVehicle(s.carrier, orderId, opts.vehicleId ?? (await freshVehicle(s)).id);
  await assignDriver(s.carrier, orderId, s.driver.id);
  const st = (status: Parameters<typeof changeStatus>[2]["status"], lat?: number, lng?: number) =>
    changeStatus(s.driverActor, orderId, {
      status,
      comment: null,
      documentIds: [],
      latitude: lat ?? null,
      longitude: lng ?? null,
      accuracy: null,
    });
  await st("AT_LOADING", 43.82, 87.61);
  await st("LOADED");
  await st("IN_TRANSIT");
  await st("AT_DELIVERY", 43.24, 76.89);
  const docs: string[] = [];
  if (opts.pod !== false) {
    const pod = await uploadOrderDocument(s.driverActor, orderId, { type: "PROOF_OF_DELIVERY", file: pdfFile("pod.pdf") });
    docs.push(pod.id);
  }
  return reportDelivered(s.driverActor, orderId, { comment: "Выгружено", documentIds: docs });
}

async function deal(orderId: string) {
  return prisma.paymentRecord.findFirstOrThrow({ where: { orderId, type: "SECURE_DEAL" }, orderBy: { createdAt: "desc" } });
}

describe("Secure Deal / безопасная сделка", () => {
  let s: Scene;

  beforeAll(async () => {
    await resetDb();
    s = await scene();
    await setSetting("commissionPercent", 2);
  });

  afterEach(() => setPaymentProviderOverride(null));

  describe("полный цикл: Load → Bid → Order → Payment → Contract → Vehicle → Driver → Tracking → Delivery → Confirmation → Release → Closed → Next Load", () => {
    let orderId: string;
    let contractId: string;

    it("заказчик оформляет безопасную сделку: платёж обеспечен, комиссия зафиксирована", async () => {
      ({ orderId, contractId } = await newOrder(s));
      // Перевозчик и посторонние не могут оформить сделку
      await expectAppError(initiateSecureDeal(s.carrier, orderId), "FORBIDDEN");
      await expectAppError(initiateSecureDeal(s.carrier2, orderId), "FORBIDDEN");

      const p = await initiateSecureDeal(s.shipper, orderId);
      expect(p.status).toBe("PAYMENT_RESERVED");
      expect(Number(p.amount)).toBe(3000);
      expect(p.currency).toBe("USD");
      expect(Number(p.platformFee)).toBe(60);
      expect(p.provider).toBe("sandbox");
      expect(p.reservedAt).not.toBeNull();

      const history = await prisma.paymentStatusHistory.findMany({ where: { paymentId: p.id }, orderBy: { createdAt: "asc" } });
      expect(history.map((h) => h.toStatus)).toEqual(["PAYMENT_PENDING", "PAYMENT_AUTHORIZED", "PAYMENT_RESERVED"]);
      const txs = await prisma.paymentTransaction.findMany({ where: { paymentId: p.id }, orderBy: { createdAt: "asc" } });
      expect(txs.map((t) => `${t.kind}:${t.status}`)).toEqual(["AUTHORIZE:SUCCEEDED", "RESERVE:SUCCEEDED"]);
      expect(new Set(txs.map((t) => t.idempotencyKey)).size).toBe(2);

      // Повторное оформление и ручные записи о платежах запрещены
      await expectAppError(initiateSecureDeal(s.shipper, orderId), "DUPLICATE_ACTION");
      await expectAppError(
        createPayment(s.shipper, orderId, {
          type: "PREPAYMENT",
          amount: 100,
          currency: "USD",
          status: "PAID",
          dueDate: null,
          paidAt: null,
          note: null,
        }),
        "CONFLICT",
      );
      // PaymentRecord безопасной сделки нельзя изменить через ручной endpoint
      await expectAppError(updatePayment(s.shipper, p.id, { status: "PAID", paidAt: null, note: null }), "FORBIDDEN");
      // Заказчик не может отменить уже обеспеченную оплату
      await expectAppError(cancelSecureDeal(s.shipper, orderId), "INVALID_STATE_TRANSITION");
    });

    it("перевозчик видит статус обеспечения и условия выплаты, водитель финансов не видит", async () => {
      const view = await getSecureDealView(s.carrier, orderId);
      expect(view.payment?.status).toBe("PAYMENT_RESERVED");
      expect(view.payout).toBe(2940);
      expect(view.conditions?.find((c) => c.key === "reserved")?.met).toBe(true);
      expect(view.conditions?.find((c) => c.key === "confirmation")?.met).toBe(false);
      expect(view.canInitiate).toBe(false);
      await expectAppError(getSecureDealView(s.driverActor, orderId), "FORBIDDEN");
      await expectAppError(getSecureDealView(s.carrier2, orderId), "FORBIDDEN");
    });

    it("выплата невозможна до выполнения условий; перевозчик не может запросить выплату", async () => {
      await expectAppError(adminRelease(s.carrier, (await deal(orderId)).id, { reason: "Хочу деньги" }), "FORBIDDEN");
      await expectAppError(
        requestOperation({ paymentId: (await deal(orderId)).id, kind: "RELEASE", by: "PAYEE", actor: s.carrier, reason: "x" }),
        "FORBIDDEN",
      );
    });

    it("доставка запускает период проверки; подтверждение получения → выплата → перевозка закрыта", async () => {
      await sign(s, contractId);
      const delivered = await driveToDelivered(s, orderId, { pod: true, vehicleId: s.vehicle.id });
      expect(delivered.currentStatus).toBe("DELIVERED");
      const o = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(o.confirmationDueAt).not.toBeNull();
      const hours = (o.confirmationDueAt!.getTime() - o.deliveredAt!.getTime()) / 3_600_000;
      expect(hours).toBe(72);
      // Автомобиль свободен сразу после выгрузки — можно брать следующий груз
      expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })).status).toBe("AVAILABLE");

      await expectAppError(confirmDelivery(s.carrier, orderId, null), "FORBIDDEN");
      const closed = await confirmDelivery(s.shipper, orderId, "Получено без замечаний");
      expect(closed.currentStatus).toBe("CLOSED");
      expect(closed.receiptConfirmedAt).not.toBeNull();

      const p = await deal(orderId);
      expect(p.status).toBe("PAYMENT_RELEASED");
      expect(Number(p.releasedAmount)).toBe(3000);
      expect(Number(p.feeCollected)).toBe(60);
      expect(p.releasedAt).not.toBeNull();
      const history = await prisma.paymentStatusHistory.findMany({ where: { paymentId: p.id }, orderBy: { createdAt: "asc" } });
      expect(history.map((h) => h.toStatus).slice(-2)).toEqual(["PAYMENT_RELEASE_PENDING", "PAYMENT_RELEASED"]);
      const release = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: p.id, kind: "RELEASE" } });
      expect(Number(release.fee)).toBe(60);

      const audit = await prisma.auditLog.findMany({ where: { entityId: orderId }, select: { action: true } });
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          "SECURE_DEAL_CREATED",
          "PAYMENT_OPERATION_REQUESTED",
          "PAYMENT_OPERATION_SUCCEEDED",
          "PAYMENT_STATUS_CHANGED",
          "DELIVERY_CONFIRMED",
          "ORDER_CLOSED",
        ]),
      );
      const statuses = await prisma.transportOrderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
      expect(statuses.at(-1)).toMatchObject({ toStatus: "CLOSED", actorType: "SYSTEM" });
    });

    it("повторная выплата и повторное подтверждение невозможны", async () => {
      const p = await deal(orderId);
      await expectAppError(adminRelease(s.admin, p.id, { reason: "Повторная выплата" }), "INVALID_STATE_TRANSITION");
      await expectAppError(adminRefund(s.admin, p.id, { reason: "Возврат после выплаты" }), "INVALID_STATE_TRANSITION");
      await expectAppError(confirmDelivery(s.shipper, orderId, null), "ORDER_ALREADY_CLOSED");
      expect(await prisma.paymentTransaction.count({ where: { paymentId: p.id, kind: "RELEASE" } })).toBe(1);
    });

    it("Next Load: после закрытия автомобиль в Алматы, подбираются грузы по направлению", async () => {
      const toMoscow = await createLoad(
        s.shipper,
        loadInput({
          title: "Алматы — Москва",
          weightKg: 15000,
          stops: [
            { type: "PICKUP", country: "KZ", city: "Алматы", plannedDateFrom: new Date(Date.now() + DAY).toISOString() },
            { type: "DELIVERY", country: "RU", city: "Москва", plannedDateFrom: new Date(Date.now() + 8 * DAY).toISOString() },
          ],
        } as never),
        { publish: true },
      );
      const { movement, matchesCount } = await createMovement(s.carrier, {
        vehicleId: s.vehicle.id,
        sourceOrderId: null,
        intent: "CITY",
        origin: null,
        destinations: [{ country: "RU", city: "Москва" }],
        allowedDeviationKm: 250,
        maxPickupDistanceKm: 300,
        availableFrom: null,
        availableUntil: null,
        note: null,
      });
      expect(movement.originLabel).toBe("Алматы");
      expect(movement.originSource).toBe("ORDER_DELIVERY");
      expect(movement.sourceOrderId).toBe(orderId);
      expect(matchesCount).toBeGreaterThanOrEqual(1);
      const res = await getMovementMatches(s.carrier, movement.id, "efficiency");
      expect(res.matches.map((m) => m.loadId)).toContain(toMoscow.id);

      // Ставка на следующий груз → принятие → назначение того же автомобиля → план выполнен
      const bid = await createBid(s.carrier, toMoscow.id, {
        amount: 4000,
        currency: "USD",
        comment: null,
        readyDate: null,
        terms: null,
        validUntil: null,
      });
      const next = await acceptBid(s.shipper, bid.id);
      await sign(s, next.contractId);
      await assignVehicle(s.carrier, next.orderId, s.vehicle.id);
      expect((await prisma.plannedMovement.findUniqueOrThrow({ where: { id: movement.id } })).status).toBe("FULFILLED");
    });
  });

  it("конкурентная двойная выплата: средства выплачиваются ровно один раз", async () => {
    const { orderId, contractId } = await newOrder(s);
    await initiateSecureDeal(s.shipper, orderId);
    await sign(s, contractId);
    await driveToDelivered(s, orderId);
    const p = await deal(orderId);
    const results = await Promise.allSettled([
      adminRelease(s.admin, p.id, { reason: "Выплата 1" }),
      adminRelease(s.admin, p.id, { reason: "Выплата 2" }),
      adminRelease(s.admin, p.id, { reason: "Выплата 3" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await deal(orderId);
    expect(after.status).toBe("PAYMENT_RELEASED");
    expect(Number(after.releasedAmount)).toBe(3000);
    expect(await prisma.paymentTransaction.count({ where: { paymentId: p.id, kind: "RELEASE", status: "SUCCEEDED" } })).toBe(1);
  });

  describe("истечение срока подтверждения", () => {
    it("спор не открыт → автоподтверждение и выплата", async () => {
      const { orderId, contractId } = await newOrder(s);
      await initiateSecureDeal(s.shipper, orderId);
      await sign(s, contractId);
      await driveToDelivered(s, orderId);
      // Срок ещё не истёк — ничего не происходит
      expect((await processConfirmationTimeouts(new Date())).confirmed).toBe(0);
      const due = (await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).confirmationDueAt!;
      const r = await processConfirmationTimeouts(new Date(due.getTime() + 60_000));
      expect(r.confirmed).toBe(1);
      expect(r.released).toBe(1);
      const o = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(o.currentStatus).toBe("CLOSED");
      expect(o.receiptAutoConfirmed).toBe(true);
      expect((await deal(orderId)).status).toBe("PAYMENT_RELEASED");
      expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "DELIVERY_AUTO_CONFIRMED" } })).toBe(1);
      // Повторный запуск задачи безопасен
      expect((await processConfirmationTimeouts(new Date(due.getTime() + 120_000))).confirmed).toBe(0);
    });

    it("без подтверждающих документов автоматическая выплата не выполняется; автоподтверждение можно отключить", async () => {
      const { orderId, contractId } = await newOrder(s);
      await initiateSecureDeal(s.shipper, orderId);
      await sign(s, contractId);
      await driveToDelivered(s, orderId, { pod: false });
      const due = (await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).confirmationDueAt!;
      const later = new Date(due.getTime() + 60_000);
      const r = await processConfirmationTimeouts(later);
      expect(r.skipped.map((x) => x.reason)).toContain("Нет подтверждающих документов (POD/CMR)");
      expect((await deal(orderId)).status).toBe("PAYMENT_RESERVED");

      await uploadOrderDocument(s.carrier, orderId, { type: "CMR", file: pdfFile("cmr.pdf") });
      await setSetting("autoConfirmOnTimeout", false);
      const off = await processConfirmationTimeouts(later);
      expect(off.confirmed).toBe(0);
      expect(off.skipped[0].reason).toMatch(/отключено/);
      await setSetting("autoConfirmOnTimeout", true);
      expect((await processConfirmationTimeouts(later)).released).toBe(1);
    });

    it("срок проверки настраивается", async () => {
      await setSetting("confirmationWindowHours", 24);
      const { orderId, contractId } = await newOrder(s);
      await initiateSecureDeal(s.shipper, orderId);
      await sign(s, contractId);
      await driveToDelivered(s, orderId);
      const o = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect((o.confirmationDueAt!.getTime() - o.deliveredAt!.getTime()) / 3_600_000).toBe(24);
      await setSetting("confirmationWindowHours", 72);
      await confirmDelivery(s.shipper, orderId, null);
    });
  });

  describe("спор", () => {
    it("спор замораживает выплату; частичная выплата $2 500, остаток удерживается; решение — раздел суммы", async () => {
      const { orderId, contractId } = await newOrder(s);
      await initiateSecureDeal(s.shipper, orderId);
      await sign(s, contractId);
      await driveToDelivered(s, orderId);
      const dispute = await openDispute(s.shipper, orderId, { reason: "SHORTAGE", description: "Недостача двух паллет по CMR" });
      expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("DISPUTED");
      let p = await deal(orderId);
      expect(p.status).toBe("PAYMENT_DISPUTED");
      expect(p.disputeId).toBe(dispute.id);

      // Во время спора получение не подтверждается, автоматика не срабатывает
      await expectAppError(confirmDelivery(s.shipper, orderId, null), "DELIVERY_NOT_ALLOWED");
      expect((await processConfirmationTimeouts(new Date(Date.now() + 30 * DAY))).confirmed).toBe(0);
      // Стороны не могут закрыть спор и выплатить деньги
      await expectAppError(
        updateDispute(s.carrier, dispute.id, { status: "RESOLVED", resolution: "Сами решили", orderOutcome: "CLOSE" }),
        "FORBIDDEN",
      );
      await expectAppError(adminRelease(s.shipper, p.id, { reason: "Выплатить" }), "FORBIDDEN");

      // Бесспорная часть — перевозчику
      p = await adminRelease(s.admin, p.id, { amount: 2500, reason: "Бесспорная часть по акту" });
      expect(p.status).toBe("PAYMENT_PARTIALLY_RELEASED");
      expect(Number(p.releasedAmount)).toBe(2500);
      expect(Number(p.feeCollected)).toBe(50);
      await expectAppError(adminRelease(s.admin, p.id, { amount: 600, reason: "Больше остатка" }), "VALIDATION_ERROR");

      // Недопустимые решения
      await expectAppError(
        updateDispute(s.admin, dispute.id, {
          status: "RESOLVED",
          resolution: "Вернуть",
          orderOutcome: "CLOSE",
          paymentOutcome: "REFUND_FULL",
        }),
        "VALIDATION_ERROR",
      );
      await expectAppError(
        updateDispute(s.admin, dispute.id, {
          status: "RESOLVED",
          resolution: "Раздел",
          orderOutcome: "CLOSE",
          paymentOutcome: "SPLIT",
          releaseAmount: 500,
        }),
        "VALIDATION_ERROR",
      );
      // Остаток $500: $200 перевозчику, $300 заказчику
      await updateDispute(s.admin, dispute.id, {
        status: "RESOLVED",
        resolution: "Недостача подтверждена частично",
        orderOutcome: "CLOSE",
        paymentOutcome: "SPLIT",
        releaseAmount: 200,
      });
      p = await deal(orderId);
      expect(p.status).toBe("PAYMENT_RELEASED");
      expect(Number(p.releasedAmount)).toBe(2700);
      expect(Number(p.refundedAmount)).toBe(300);
      expect(Number(p.feeCollected)).toBe(54);
      expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("CLOSED");
      const audit = await prisma.auditLog.findMany({ where: { entityId: orderId, action: "DISPUTE_RESOLVED" } });
      expect(audit[0].newValue).toMatchObject({ paymentOutcome: "SPLIT", releaseAmount: 200 });
    });

    it("возобновление перевозки после спора возвращает оплату в резерв", async () => {
      const { orderId, contractId } = await newOrder(s);
      await initiateSecureDeal(s.shipper, orderId);
      await sign(s, contractId);
      const dispute = await openDispute(s.carrier, orderId, {
        reason: "PAYMENT_ISSUE",
        description: "Уточнение условий оплаты по договору",
      });
      expect((await deal(orderId)).status).toBe("PAYMENT_DISPUTED");
      await expectAppError(
        updateDispute(s.admin, dispute.id, {
          status: "RESOLVED",
          resolution: "Продолжить",
          orderOutcome: "RESUME",
          paymentOutcome: "REFUND_FULL",
        }),
        "VALIDATION_ERROR",
      );
      await updateDispute(s.admin, dispute.id, { status: "RESOLVED", resolution: "Условия подтверждены", orderOutcome: "RESUME" });
      expect((await deal(orderId)).status).toBe("PAYMENT_RESERVED");
      expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("CONTRACT_SIGNED");
    });

    it("отмена перевозки по спору → полный возврат заказчику", async () => {
      const { orderId, contractId } = await newOrder(s);
      await initiateSecureDeal(s.shipper, orderId);
      await sign(s, contractId);
      const dispute = await openDispute(s.shipper, orderId, { reason: "TERMS_VIOLATION", description: "Перевозчик отказался от рейса" });
      await updateDispute(s.admin, dispute.id, { status: "RESOLVED", resolution: "Отказ подтверждён", orderOutcome: "CANCEL" });
      const p = await deal(orderId);
      expect(p.status).toBe("PAYMENT_REFUNDED");
      expect(Number(p.refundedAmount)).toBe(3000);
      expect(Number(p.feeCollected)).toBe(0);
    });
  });

  it("отмена перевозки до подписания договора → обеспеченная оплата возвращается", async () => {
    const { orderId } = await newOrder(s);
    await initiateSecureDeal(s.shipper, orderId);
    await cancelOrder(s.shipper, orderId, "Груз больше не актуален");
    const p = await deal(orderId);
    expect(p.status).toBe("PAYMENT_REFUNDED");
    expect(Number(p.refundedAmount)).toBe(3000);
    const refund = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: p.id, kind: "REFUND" } });
    expect(refund.status).toBe("SUCCEEDED");
  });

  it("отказ провайдера: платёж FAILED, сделку можно оформить заново", async () => {
    const failing: PaymentProvider = {
      code: "sandbox",
      title: "failing",
      testMode: true,
      manualConfirmation: false,
      twoStepReserve: false,
      async execute() {
        return { status: "FAILED", providerTransactionId: null, failureReason: "Недостаточно средств" };
      },
    };
    const { orderId } = await newOrder(s);
    setPaymentProviderOverride(failing);
    const p = await initiateSecureDeal(s.shipper, orderId);
    expect(p.status).toBe("PAYMENT_FAILED");
    expect(p.failureReason).toBe("Недостаточно средств");
    setPaymentProviderOverride(null);
    const again = await initiateSecureDeal(s.shipper, orderId);
    expect(again.status).toBe("PAYMENT_RESERVED");
    expect(again.id).not.toBe(p.id);
  });

  it("провайдер с ручным подтверждением: операция ждёт администратора; webhook идемпотентен", async () => {
    setPaymentProviderOverride(manualProvider);
    const { orderId } = await newOrder(s);
    let p = await initiateSecureDeal(s.shipper, orderId);
    expect(p.status).toBe("PAYMENT_PENDING");
    const t = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: p.id, status: "PENDING" } });
    expect(t.kind).toBe("RESERVE");
    // Повторный запрос во время незавершённой операции отклоняется
    await expectAppError(
      requestOperation({ paymentId: p.id, kind: "RESERVE", by: "PAYER", actor: s.shipper, reason: "Ещё раз" }),
      "DUPLICATE_ACTION",
    );
    await expectAppError(
      adminConfirmTransaction(s.carrier, t.id, { outcome: "SUCCEEDED", providerTransactionId: "PP-1", failureReason: null }),
      "FORBIDDEN",
    );
    await expectAppError(
      adminConfirmTransaction(s.admin, t.id, { outcome: "SUCCEEDED", providerTransactionId: null, failureReason: null }),
      "VALIDATION_ERROR",
    );
    p = await adminConfirmTransaction(s.admin, t.id, {
      outcome: "SUCCEEDED",
      providerTransactionId: "ПП №123 от банка",
      failureReason: null,
    });
    expect(p.status).toBe("PAYMENT_RESERVED");
    expect(await prisma.auditLog.count({ where: { entityId: orderId, action: "PAYMENT_OPERATION_CONFIRMED_MANUALLY" } })).toBe(1);

    // Возврат через webhook провайдера; повторная доставка webhook ничего не меняет
    await adminRefund(s.admin, p.id, { amount: 1000, reason: "Частичный возврат по соглашению" });
    const refund = await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: p.id, kind: "REFUND" } });
    expect(refund.status).toBe("PENDING");
    expect(
      await handleProviderWebhook("manual", { idempotencyKey: refund.idempotencyKey, status: "SUCCEEDED", providerTransactionId: "R-1" }),
    ).toEqual({
      processed: true,
    });
    expect(
      await handleProviderWebhook("manual", { idempotencyKey: refund.idempotencyKey, status: "SUCCEEDED", providerTransactionId: "R-1" }),
    ).toEqual({
      processed: false,
    });
    await expectAppError(handleProviderWebhook("sandbox", { idempotencyKey: refund.idempotencyKey, status: "FAILED" }), "NOT_FOUND");
    p = await deal(orderId);
    expect(Number(p.refundedAmount)).toBe(1000);
    expect(p.status).toBe("PAYMENT_RESERVED");
  });

  it("заказчик может отменить неподтверждённую безопасную сделку", async () => {
    setPaymentProviderOverride(manualProvider);
    const { orderId } = await newOrder(s);
    await initiateSecureDeal(s.shipper, orderId);
    await expectAppError(cancelSecureDeal(s.carrier, orderId), "FORBIDDEN");
    const c = await cancelSecureDeal(s.shipper, orderId);
    expect(c.status).toBe("PAYMENT_CANCELLED");
    expect(await prisma.paymentTransaction.count({ where: { paymentId: c.id, status: "PENDING" } })).toBe(0);
  });

  describe("настройка «оплата обязательна до загрузки»", () => {
    beforeEach(() => setSetting("requireSecureDeal", true));
    afterEach(() => setSetting("requireSecureDeal", false));

    it("без обеспеченной оплаты начать загрузку нельзя", async () => {
      const { orderId, contractId } = await newOrder(s);
      await sign(s, contractId);
      await assignVehicle(s.carrier, orderId, (await freshVehicle(s)).id);
      await assignDriver(s.carrier, orderId, s.driver.id);
      const toLoading = () =>
        changeStatus(s.driverActor, orderId, {
          status: "AT_LOADING",
          comment: null,
          documentIds: [],
          latitude: null,
          longitude: null,
          accuracy: null,
        });
      await expectAppError(toLoading(), "INVALID_STATE_TRANSITION");
      await initiateSecureDeal(s.shipper, orderId);
      await toLoading();
      await cancelOrder(s.admin, orderId, "Завершение теста");
    });
  });
});
