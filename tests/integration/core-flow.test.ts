import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { acceptBid, counterBid, createBid, respondToCounter } from "@/server/services/bid.service";
import { signContract } from "@/server/services/contract.service";
import { uploadOrderDocument } from "@/server/services/document.service";
import { createLoad, publishLoad } from "@/server/services/load.service";
import { assignDriver, assignVehicle, changeStatus, confirmDelivery, reportDelivered } from "@/server/services/order.service";
import { createReview } from "@/server/services/review.service";
import { addLocation, listTracking } from "@/server/services/tracking.service";
import { expectAppError, loadInput, PASSWORD, pdfFile, resetDb, scene } from "./helpers";

type Scene = Awaited<ReturnType<typeof scene>>;

/**
 * Полный сценарий MVP через сервисный слой и реальную БД:
 * груз → публикация → ставка → встречная цена → принятие → заказ → договор → подписи
 * → автомобиль → водитель → статусы водителя → трекинг → доставка с POD → подтверждение → отзывы.
 */
describe("core flow", () => {
  let s: Scene;
  let loadId: string;
  let bidId: string;
  let orderId: string;
  let contractId: string;

  beforeAll(async () => {
    await resetDb();
    s = await scene();
  });

  it("создаёт груз (черновик) и публикует его", async () => {
    const draft = await createLoad(s.shipper, loadInput(), { publish: false });
    expect(draft.status).toBe("DRAFT");
    expect(draft.publicNumber).toMatch(/^CF-L-\d{6}$/);
    loadId = draft.id;
    const stops = await prisma.loadStop.findMany({ where: { loadId }, orderBy: { sequence: "asc" } });
    expect(stops.map((x) => x.city)).toEqual(["Урумчи", "Алматы", "Москва"]);
    expect(stops[0].latitude).not.toBeNull(); // локальный геокодер
    expect(stops[0].timezone).toBe("Asia/Shanghai");

    const published = await publishLoad(s.shipper, loadId);
    expect(published.status).toBe("PUBLISHED");
    await expectAppError(publishLoad(s.shipper, loadId), "DUPLICATE_ACTION");

    const audit = await prisma.auditLog.findMany({ where: { entityId: loadId }, select: { action: true } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["LOAD_CREATED", "LOAD_PUBLISHED"]));
    const notif = await prisma.notification.count({ where: { userId: s.shipper.userId, type: "LOAD_PUBLISHED" } });
    expect(notif).toBe(1);
  });

  it("перевозчик делает ставку, повторная активная ставка запрещена", async () => {
    const bid = await createBid(s.carrier, loadId, {
      amount: 4200,
      currency: "USD",
      comment: "Готовы",
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    bidId = bid.id;
    expect((await prisma.load.findUniqueOrThrow({ where: { id: loadId } })).status).toBe("BIDDING");
    await expectAppError(
      createBid(s.carrier, loadId, { amount: 4100, currency: "USD", comment: null, readyDate: null, terms: null, validUntil: null }),
      "BID_ALREADY_EXISTS",
    );
    // Заказчик получил уведомление о новой ставке
    expect(await prisma.notification.count({ where: { userId: s.shipper.userId, type: "NEW_BID" } })).toBe(1);
  });

  it("торг: встречная цена сохраняет историю переговоров", async () => {
    await counterBid(s.shipper, bidId, 4000, "Можем 4000");
    await respondToCounter(s.carrier, bidId, { action: "propose", amount: 4100, message: "4100 последняя" });
    const bid = await prisma.bid.findUniqueOrThrow({ where: { id: bidId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    expect(Number(bid.amount)).toBe(4100);
    expect(bid.messages.map((m) => [m.type, Number(m.amount)])).toEqual([
      ["OFFER", 4200],
      ["COUNTER", 4000],
      ["OFFER", 4100],
    ]);
  });

  it("принятие ставки создаёт ровно один заказ и договор в одной транзакции", async () => {
    const competing = await createBid(s.carrier2, loadId, {
      amount: 4300,
      currency: "USD",
      comment: null,
      readyDate: null,
      terms: null,
      validUntil: null,
    });
    const res = await acceptBid(s.shipper, bidId);
    orderId = res.orderId;
    contractId = res.contractId;
    expect(res.orderNumber).toMatch(/^CF-O-\d{6}$/);

    const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.currentStatus).toBe("CONTRACT_PENDING");
    expect(Number(order.agreedAmount)).toBe(4100);
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).status).toBe("ACCEPTED");
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: competing.id } })).status).toBe("REJECTED");
    expect((await prisma.load.findUniqueOrThrow({ where: { id: loadId } })).status).toBe("CARRIER_SELECTED");
    expect(await prisma.transportOrder.count({ where: { loadId } })).toBe(1);

    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    expect(contract.documentNumber).toMatch(/^CF-C-\d{6}$/);
    expect(contract.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.contentSnapshot).toContain("Shipper LLP");
    expect(contract.contentSnapshot).toContain("Carrier LLP");

    // Идемпотентность: повторное принятие не создаёт дубль
    await expectAppError(acceptBid(s.shipper, bidId), "BID_ALREADY_ACCEPTED");
    expect(await prisma.transportOrder.count({ where: { loadId } })).toBe(1);
    const history = await prisma.transportOrderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual(["CARRIER_SELECTED", "CONTRACT_PENDING"]);
    expect(await prisma.notification.count({ where: { userId: s.carrier.userId, type: "BID_ACCEPTED" } })).toBe(1);
  });

  it("нельзя назначить транспорт до подписания договора", async () => {
    await expectAppError(assignVehicle(s.carrier, orderId, s.vehicle.id), "INVALID_STATE_TRANSITION");
  });

  it("подписание договора обеими сторонами с повторной аутентификацией", async () => {
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    await expectAppError(
      signContract(s.shipper, contractId, { password: "wrong-password", documentHash: contract.contentHash }),
      "FORBIDDEN",
    );
    await expectAppError(signContract(s.shipper, contractId, { password: PASSWORD, documentHash: "0".repeat(64) }), "CONFLICT");

    const first = await signContract(s.shipper, contractId, { password: PASSWORD, documentHash: contract.contentHash });
    expect(first.fullySigned).toBe(false);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe("PARTIALLY_SIGNED");
    await expectAppError(
      signContract(s.shipper, contractId, { password: PASSWORD, documentHash: contract.contentHash }),
      "CONTRACT_ALREADY_SIGNED",
    );

    const second = await signContract(s.carrier, contractId, { password: PASSWORD, documentHash: contract.contentHash });
    expect(second.fullySigned).toBe(true);
    const signed = await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { signatures: true } });
    expect(signed.status).toBe("SIGNED");
    expect(signed.signatures).toHaveLength(2);
    for (const sig of signed.signatures) {
      expect(sig.documentHash).toBe(contract.contentHash);
      expect(sig.method).toBe("INTERNAL_ACCEPTANCE");
      expect(sig.ipAddress).toBe("10.0.0.1");
    }
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("CONTRACT_SIGNED");
    expect((await prisma.load.findUniqueOrThrow({ where: { id: loadId } })).status).toBe("CONVERTED_TO_ORDER");
    await expectAppError(
      signContract(s.carrier, contractId, { password: PASSWORD, documentHash: contract.contentHash }),
      "CONTRACT_ALREADY_SIGNED",
    );
  });

  it("назначение автомобиля: проверка грузоподъёмности и доступности", async () => {
    await expectAppError(assignVehicle(s.carrier, orderId, s.smallVehicle.id), "VEHICLE_UNAVAILABLE");
    await expectAppError(assignVehicle(s.shipper, orderId, s.vehicle.id), "FORBIDDEN");
    await assignVehicle(s.carrier, orderId, s.vehicle.id);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })).status).toBe("ASSIGNED");
    expect((await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } })).currentStatus).toBe("VEHICLE_ASSIGNED");
  });

  it("назначение водителя переводит рейс в ожидание загрузки и уведомляет водителя", async () => {
    await assignDriver(s.carrier, orderId, s.driver.id);
    const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.driverId).toBe(s.driver.id);
    expect(order.currentStatus).toBe("WAITING_FOR_LOADING");
    expect(await prisma.notification.count({ where: { userId: s.driverActor.userId, type: "DRIVER_ASSIGNED" } })).toBe(1);
  });

  it("водитель проводит рейс по state machine, недопустимые переходы отклоняются", async () => {
    const st = (status: Parameters<typeof changeStatus>[2]["status"], lat?: number, lng?: number) =>
      changeStatus(s.driverActor, orderId, {
        status,
        comment: null,
        documentIds: [],
        latitude: lat ?? null,
        longitude: lng ?? null,
        accuracy: lat ? 15 : null,
      });

    await expectAppError(st("LOADED"), "INVALID_STATE_TRANSITION");
    await st("AT_LOADING", 43.82, 87.61);
    await uploadOrderDocument(s.driverActor, orderId, { type: "OTHER", file: pdfFile("photo-report.pdf") });
    await st("LOADED");
    await st("IN_TRANSIT");
    await addLocation(s.driverActor, orderId, { latitude: 44.21, longitude: 80.41, accuracy: 20, note: "Хоргос", recordedAt: null });
    await st("AT_BORDER");
    await expectAppError(st("BORDER_CLEARED"), "INVALID_STATE_TRANSITION");
    await st("CUSTOMS");
    await st("BORDER_CLEARED");
    await st("IN_TRANSIT");
    await st("AT_DELIVERY", 55.75, 37.61);

    const tracking = await listTracking(s.shipper, orderId, { limit: 50 });
    expect(tracking.lastLocation?.latitude).toBeCloseTo(55.75);
    expect(tracking.items.map((t) => t.type)).toEqual(
      expect.arrayContaining([
        "ARRIVED_LOADING",
        "LOADED",
        "DEPARTED",
        "MANUAL_LOCATION",
        "BORDER_ARRIVED",
        "BORDER_CLEARED",
        "DELIVERY_ARRIVED",
      ]),
    );
    const history = await prisma.transportOrderStatusHistory.count({ where: { orderId, source: "DRIVER_APP" } });
    expect(history).toBe(8);
  });

  it("закрыть заказ без POD нельзя; водитель отмечает доставку с CMR", async () => {
    // Подтвердить получение до отметки доставки нельзя
    await expectAppError(confirmDelivery(s.shipper, orderId, null), "DELIVERY_NOT_ALLOWED");
    const pod = await uploadOrderDocument(s.driverActor, orderId, { type: "PROOF_OF_DELIVERY", file: pdfFile("pod.pdf") });
    const delivered = await reportDelivered(s.driverActor, orderId, { comment: "Без замечаний", documentIds: [pod.id] });
    expect(delivered.currentStatus).toBe("DELIVERED");
    await expectAppError(reportDelivered(s.driverActor, orderId, { comment: null, documentIds: [] }), "DUPLICATE_ACTION");
  });

  it("заказчик подтверждает получение → CLOSED, финансы обновлены", async () => {
    await prisma.paymentRecord.create({
      data: {
        orderId,
        payerCompanyId: s.shipperCo.id,
        payeeCompanyId: s.carrierCo.id,
        amount: 1500,
        currency: "USD",
        type: "PREPAYMENT",
        status: "PAID",
        paidAt: new Date(),
      },
    });
    const closed = await confirmDelivery(s.shipper, orderId, "Получено");
    expect(closed.currentStatus).toBe("CLOSED");
    await expectAppError(confirmDelivery(s.shipper, orderId, null), "ORDER_ALREADY_CLOSED");
    const final = await prisma.paymentRecord.findFirstOrThrow({ where: { orderId, type: "FINAL_PAYMENT" } });
    expect(Number(final.amount)).toBe(2600); // 4100 − 1500
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } })).status).toBe("AVAILABLE");
    const actions = (await prisma.auditLog.findMany({ where: { entityId: orderId }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "ORDER_CREATED",
        "CONTRACT_CREATED",
        "CONTRACT_SIGNED",
        "VEHICLE_ASSIGNED",
        "DRIVER_ASSIGNED",
        "STATUS_CHANGED",
        "TRACKING_UPDATED",
        "DELIVERY_CONFIRMED",
        "ORDER_CLOSED",
        "PAYMENT_CREATED",
      ]),
    );
  });

  it("обе стороны оставляют по одному отзыву", async () => {
    await createReview(s.shipper, orderId, { rating: 5, punctuality: 5, communication: 5, documentation: 4, comment: "Отлично" });
    await createReview(s.carrier, orderId, { rating: 4, punctuality: null, communication: null, documentation: null, comment: null });
    await expectAppError(
      createReview(s.shipper, orderId, { rating: 1, punctuality: null, communication: null, documentation: null, comment: null }),
      "DUPLICATE_ACTION",
    );
    await expectAppError(
      createReview(s.driverActor, orderId, { rating: 5, punctuality: null, communication: null, documentation: null, comment: null }),
      "FORBIDDEN",
    );
    expect(await prisma.review.count({ where: { orderId } })).toBe(2);
  });
});
