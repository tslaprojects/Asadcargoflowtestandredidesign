import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionSource, OrderStatus } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { financeSummary } from "@/lib/money";
import {
  ACTIVE_STATUSES,
  IN_TRANSIT_STATUSES,
  ORDER_STATUS_LABELS,
  RESOURCE_BUSY_STATUSES,
  TRANSITION_TRACKING_EVENT,
  UNASSIGNABLE_STATUSES,
} from "@/lib/state-machine/order-state-machine";
import { toPlain } from "@/lib/serialize";
import type { orderListQuerySchema, statusChangeSchema } from "@/lib/validation/order";
import { ordersWhereForActor, requireOrderAccess, resolveOrderAccess, type OrderSide } from "./access";
import { companyRatings } from "./company.service";
import { notify } from "./notification.service";
import { lockOrder, orderParticipantUserIds, performTransitionInTx } from "./order-core";
import { getSettings } from "./settings.service";

type ListQuery = z.output<typeof orderListQuerySchema>;

const ATTENTION_STATUSES: OrderStatus[] = ["CONTRACT_PENDING", "CONTRACT_SIGNED", "VEHICLE_ASSIGNED", "DELIVERED", "DISPUTED", "ON_HOLD"];

const orderListInclude = {
  load: {
    select: {
      id: true,
      publicNumber: true,
      title: true,
      clientName: true,
      weightKg: true,
      stops: { orderBy: { sequence: "asc" as const }, select: { sequence: true, type: true, country: true, city: true } },
    },
  },
  shipper: { select: { id: true, legalName: true, verificationStatus: true } },
  carrier: { select: { id: true, legalName: true, verificationStatus: true } },
  vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
  driver: { select: { id: true, fullName: true } },
} satisfies Prisma.TransportOrderInclude;

export async function listOrders(actor: Actor, q: ListQuery) {
  const and: Prisma.TransportOrderWhereInput[] = [ordersWhereForActor(actor)];
  if (q.group === "active") and.push({ currentStatus: { in: ACTIVE_STATUSES } });
  if (q.group === "in_transit") and.push({ currentStatus: { in: IN_TRANSIT_STATUSES } });
  if (q.group === "attention") and.push({ currentStatus: { in: ATTENTION_STATUSES } });
  if (q.group === "completed") and.push({ currentStatus: { in: ["DELIVERED", "CLOSED"] } });
  if (q.status) and.push({ currentStatus: { in: q.status.split(",") as OrderStatus[] } });
  if (q.carrierId) and.push({ carrierCompanyId: q.carrierId });
  if (q.shipperId) and.push({ shipperCompanyId: q.shipperId });
  if (q.client) and.push({ load: { clientName: { contains: q.client, mode: "insensitive" } } });
  if (q.dateFrom) and.push({ loadingDate: { gte: new Date(q.dateFrom) } });
  if (q.dateTo) and.push({ loadingDate: { lte: new Date(`${q.dateTo}T23:59:59Z`) } });
  if (q.q) {
    const s = q.q.trim();
    and.push({
      OR: [
        { publicNumber: { contains: s, mode: "insensitive" } },
        { load: { publicNumber: { contains: s, mode: "insensitive" } } },
        { load: { title: { contains: s, mode: "insensitive" } } },
        { load: { stops: { some: { city: { contains: s, mode: "insensitive" } } } } },
        { carrier: { legalName: { contains: s, mode: "insensitive" } } },
        { shipper: { legalName: { contains: s, mode: "insensitive" } } },
        { vehicle: { plateNumber: { contains: s, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.TransportOrderWhereInput = { AND: and };
  const orderBy: Prisma.TransportOrderOrderByWithRelationInput =
    q.sort === "created"
      ? { createdAt: "desc" }
      : q.sort === "loading"
        ? { loadingDate: "asc" }
        : q.sort === "amount"
          ? { agreedAmount: "desc" }
          : { updatedAt: "desc" };
  const [items, total] = await Promise.all([
    prisma.transportOrder.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: orderListInclude }),
    prisma.transportOrder.count({ where }),
  ]);
  // Финансовые данные водителю не показываем
  const safe = items.map((o) => {
    const access = resolveOrderAccess(actor, { ...o, driver: null });
    const canSeeMoney = access ? access.can("PAYMENT_VIEW") : actor.isAdmin;
    return { ...o, agreedAmount: canSeeMoney ? o.agreedAmount : null };
  });
  return { items: safe, total, page: q.page, pageSize: q.pageSize };
}

/** Полная карточка сделки с учётом роли (минимально необходимые данные). */
export async function getOrderDetail(actor: Actor, orderId: string) {
  const { access } = await requireOrderAccess(actor, orderId, undefined);
  const isDriver = access.side === "DRIVER";
  const canMoney = access.can("PAYMENT_VIEW");

  const order = await prisma.transportOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      load: {
        include: {
          stops: { orderBy: { sequence: "asc" } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      },
      shipper: { select: { id: true, legalName: true, verificationStatus: true, phone: true, email: true, country: true, city: true } },
      carrier: { select: { id: true, legalName: true, verificationStatus: true, phone: true, email: true, country: true, city: true } },
      forwarder: { select: { id: true, legalName: true } },
      acceptedBid: { select: { id: true, amount: true, currency: true, createdAt: true } },
      vehicle: true,
      driver: { select: { id: true, fullName: true, phone: true, licenseCategory: true, userId: true, status: true } },
      statusHistory: { orderBy: { createdAt: "asc" } },
      disputes: { orderBy: { createdAt: "desc" }, include: { comments: { orderBy: { createdAt: "asc" } } } },
      reviews: { include: { fromCompany: { select: { legalName: true } } } },
      contracts: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          signatures: {
            where: { signatureStatus: "SIGNED" },
            include: { user: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } } },
          },
        },
      },
    },
  });

  const [lastLocation, payments, ratings, historyUsers, documentsCount, podCount] = await Promise.all([
    prisma.trackingEvent.findFirst({
      where: { orderId, latitude: { not: null }, longitude: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
    canMoney ? prisma.paymentRecord.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    companyRatings([order.shipperCompanyId, order.carrierCompanyId]),
    prisma.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              [
                ...order.statusHistory.map((h) => h.actorUserId),
                ...order.disputes.flatMap((d) => [d.openedByUserId, d.resolvedByUserId, ...d.comments.map((c) => c.authorUserId)]),
              ].filter(Boolean) as string[],
            ),
          ],
        },
      },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.orderDocument.count({ where: { orderId, status: "ACTIVE" } }),
    prisma.orderDocument.count({ where: { orderId, status: "ACTIVE", type: { in: ["PROOF_OF_DELIVERY", "CMR"] } } }),
  ]);

  const settings = await getSettings();
  const plainPayments = toPlain(payments);
  const finance = canMoney
    ? financeSummary(
        Number(order.agreedAmount),
        order.currency,
        plainPayments.map((p) => ({ ...p, amount: Number(p.amount) })),
      )
    : null;

  const userNames = Object.fromEntries(historyUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const contract = order.contracts[0] ?? null;

  return {
    order: {
      ...order,
      agreedAmount: canMoney ? order.agreedAmount : null,
      acceptedBid: canMoney ? order.acceptedBid : null,
      contracts: undefined,
      // Водителю — только контакты, без реквизитов заказчика
      shipper: isDriver ? { ...order.shipper, email: null } : order.shipper,
    },
    contract: contract && !isDriver ? contract : null,
    lastLocation,
    payments: canMoney ? payments : [],
    finance,
    ratings,
    userNames,
    documentsCount,
    podCount,
    requirePod: settings.requirePodForClose,
    access: { side: access.side as OrderSide, permissions: [...access.permissions], companyId: access.membership?.companyId ?? null },
  };
}

/** Журнал аудита по сделке (лента «История изменений»). */
export async function getOrderAuditTrail(actor: Actor, orderId: string, opts: { page: number; pageSize: number }) {
  const { access } = await requireOrderAccess(actor, orderId);
  if (access.side === "DRIVER") throw errors.forbidden("История изменений недоступна водителю.");
  const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId }, select: { loadId: true, acceptedBidId: true } });
  const bids = await prisma.bid.findMany({ where: { loadId: order.loadId }, select: { id: true } });
  const where: Prisma.AuditLogWhereInput = {
    OR: [
      { entityType: "TransportOrder", entityId: orderId },
      { entityType: "Load", entityId: order.loadId },
      { entityType: "Bid", entityId: { in: bids.map((b) => b.id) } },
      { entityType: "OrderDocument", newValue: { path: ["orderId"], equals: orderId } },
    ],
    action: { notIn: ["CONTRACT_VIEWED", "DOCUMENT_DOWNLOADED", "MESSAGE_SENT", "TRACKING_UPDATED"] },
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { actor: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

// ─────────── Смена статуса ───────────

export async function changeStatus(
  actor: Actor,
  orderId: string,
  input: z.output<typeof statusChangeSchema>,
  source: ActionSource = "WEB",
) {
  const { access, order } = await requireOrderAccess(actor, orderId);
  const to = input.status;
  if (to === "CANCELLED") return cancelOrder(actor, orderId, input.comment ?? "");
  if (to === "ON_HOLD") {
    if (access.side !== "ADMIN") throw errors.forbidden("Приостановить перевозку может только администратор.");
  } else if (!access.can("ORDER_STATUS_UPDATE")) {
    throw errors.forbidden("У вас нет прав на изменение статуса этой перевозки.");
  }
  await validateAttachments(orderId, input.documentIds);

  return prisma.$transaction(async (tx) => {
    let trackingEventId: string | null = null;
    const trackingType = TRANSITION_TRACKING_EVENT[to];
    const expectedFrom = order.currentStatus;
    if (trackingType) {
      const ev = await tx.trackingEvent.create({
        data: {
          orderId,
          userId: actor.userId,
          type: trackingType,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          accuracy: input.accuracy ?? null,
          note: input.comment,
          source: access.side === "DRIVER" ? "DRIVER_APP" : "WEB",
        },
      });
      trackingEventId = ev.id;
    }
    const { order: updated } = await performTransitionInTx(tx, {
      orderId,
      to,
      side: access.side,
      actor,
      source: access.side === "DRIVER" ? "DRIVER_APP" : source,
      comment: input.comment,
      trackingEventId,
      documentIds: input.documentIds,
      manual: true,
      expectedFrom,
    });
    return updated;
  });
}

async function validateAttachments(orderId: string, ids: string[] | undefined) {
  if (!ids?.length) return;
  const count = await prisma.orderDocument.count({ where: { id: { in: ids }, orderId, status: "ACTIVE" } });
  if (count !== new Set(ids).size) throw errors.validation("Некоторые вложения не найдены в документах перевозки.");
}

export async function cancelOrder(actor: Actor, orderId: string, reason: string) {
  const { access } = await requireOrderAccess(actor, orderId);
  if (access.side === "DRIVER") throw errors.forbidden("Водитель не может отменить перевозку.");
  if (access.side !== "ADMIN" && !access.can("ORDER_CANCEL")) throw errors.forbidden("У вас нет прав на отмену перевозки.");
  if (!reason || reason.trim().length < 3) throw errors.validation("Укажите причину отмены.", { comment: ["Укажите причину отмены"] });

  return prisma.$transaction(async (tx) => {
    const { order, from } = await performTransitionInTx(tx, {
      orderId,
      to: "CANCELLED",
      side: access.side,
      actor,
      source: "WEB",
      comment: `Отмена: ${reason}`,
      manual: true,
    });
    await tx.contract.updateMany({
      where: { orderId, status: { in: ["PENDING_SIGNATURES", "PARTIALLY_SIGNED", "DRAFT"] } },
      data: { status: "CANCELLED" },
    });
    await tx.load.update({ where: { id: order.loadId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    await tx.paymentRecord.updateMany({ where: { orderId, status: { in: ["PLANNED", "INVOICED"] } }, data: { status: "CANCELLED" } });
    await audit(
      actor,
      {
        action: AuditAction.ORDER_CANCELLED,
        entityType: "TransportOrder",
        entityId: orderId,
        oldValue: { status: from },
        newValue: { status: "CANCELLED", reason },
      },
      tx,
    );
    return order;
  });
}

// ─────────── Назначение транспорта ───────────

function orderWindow(o: { loadingDate: Date | null; deliveryDate: Date | null }) {
  const start = o.loadingDate ?? new Date();
  const end = o.deliveryDate ?? new Date(start.getTime() + 14 * 24 * 60 * 60_000);
  return { start, end };
}

/** Доступные автомобили для заказа с признаками совместимости. */
export async function vehicleOptionsForOrder(actor: Actor, orderId: string) {
  const { order } = await requireOrderAccess(actor, orderId, "ORDER_ASSIGN_VEHICLE");
  const load = await prisma.load.findUniqueOrThrow({
    where: { id: order.loadId },
    select: { weightKg: true, volumeM3: true, bodyType: true, requiresGps: true },
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: order.carrierCompanyId, deletedAt: null },
    orderBy: [{ status: "asc" }, { plateNumber: "asc" }],
  });
  return vehicles.map((v) => {
    const problems: string[] = [];
    if (v.status !== "AVAILABLE")
      problems.push(`Статус: ${v.status === "ASSIGNED" ? "на рейсе" : v.status === "MAINTENANCE" ? "на обслуживании" : "неактивен"}`);
    if (Number(v.capacityKg) < Number(load.weightKg)) problems.push("Недостаточная грузоподъёмность");
    if (load.requiresGps && !v.gpsEnabled) problems.push("Нет GPS (требуется по заявке)");
    const warnings: string[] = [];
    if (load.bodyType && load.bodyType !== v.bodyType) warnings.push("Тип кузова отличается от заявленного");
    if (load.volumeM3 && v.volumeM3 && Number(v.volumeM3) < Number(load.volumeM3)) warnings.push("Объём кузова меньше объёма груза");
    return { ...toPlain(v), available: problems.length === 0, problems, warnings };
  });
}

export async function assignVehicle(actor: Actor, orderId: string, vehicleId: string) {
  const { access } = await requireOrderAccess(actor, orderId, "ORDER_ASSIGN_VEHICLE");
  if (access.side !== "CARRIER" && access.side !== "ADMIN") throw errors.forbidden("Назначать автомобиль может только перевозчик.");

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId }, include: { load: true } });
    if (order.vehicleId === vehicleId) throw new AppError("DUPLICATE_ACTION", "Этот автомобиль уже назначен на рейс.");
    if (order.currentStatus !== "CONTRACT_SIGNED") {
      if (["CARRIER_SELECTED", "CONTRACT_PENDING"].includes(order.currentStatus)) {
        throw new AppError("INVALID_STATE_TRANSITION", "Нельзя назначить транспорт до подписания договора обеими сторонами.");
      }
      if (order.vehicleId)
        throw new AppError("INVALID_STATE_TRANSITION", "Автомобиль уже назначен. Сначала снимите текущий автомобиль с рейса.");
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        `Нельзя назначить автомобиль в статусе «${ORDER_STATUS_LABELS[order.currentStatus]}».`,
      );
    }
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId}::uuid FOR UPDATE`;
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.deletedAt || vehicle.companyId !== order.carrierCompanyId)
      throw errors.notFound("Автомобиль не найден в вашем автопарке.");
    if (vehicle.status !== "AVAILABLE")
      throw new AppError("VEHICLE_UNAVAILABLE", "Нельзя назначить автомобиль: он недоступен (на рейсе, в ремонте или неактивен).");
    if (Number(vehicle.capacityKg) < Number(order.load.weightKg)) {
      throw new AppError("VEHICLE_UNAVAILABLE", "Нельзя назначить автомобиль: его грузоподъёмность недостаточна.");
    }
    if (order.load.requiresGps && !vehicle.gpsEnabled) {
      throw new AppError("VEHICLE_UNAVAILABLE", "Нельзя назначить автомобиль: груз требует наличия GPS.");
    }
    const conflict = await tx.transportOrder.findFirst({
      where: { vehicleId, id: { not: orderId }, currentStatus: { in: RESOURCE_BUSY_STATUSES } },
      select: { publicNumber: true },
    });
    if (conflict) throw new AppError("VEHICLE_UNAVAILABLE", `Автомобиль уже задействован в перевозке ${conflict.publicNumber}.`);

    await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "ASSIGNED" } });
    await tx.transportOrder.update({ where: { id: orderId }, data: { vehicleId } });
    await performTransitionInTx(tx, {
      orderId,
      to: "VEHICLE_ASSIGNED",
      side: access.side,
      actor,
      source: "WEB",
      comment: `Назначен автомобиль ${vehicle.make} ${vehicle.model}, ${vehicle.plateNumber}`,
      silent: true,
    });
    await audit(
      actor,
      {
        action: AuditAction.VEHICLE_ASSIGNED,
        entityType: "TransportOrder",
        entityId: orderId,
        newValue: { vehicleId, plateNumber: vehicle.plateNumber },
      },
      tx,
    );
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, order, { customer: true, carrier: true }),
      excludeUserId: actor.userId,
      type: "VEHICLE_ASSIGNED",
      title: `${order.publicNumber}: назначен автомобиль`,
      body: `${vehicle.make} ${vehicle.model}, ${vehicle.plateNumber}`,
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}`,
    });
    return { vehicleId };
  });
}

export async function unassignVehicle(actor: Actor, orderId: string) {
  const { access } = await requireOrderAccess(actor, orderId, "ORDER_ASSIGN_VEHICLE");
  if (access.side !== "CARRIER" && access.side !== "ADMIN") throw errors.forbidden("Снять автомобиль может только перевозчик.");
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId }, include: { vehicle: true, driver: true } });
    if (!order.vehicleId) throw new AppError("DUPLICATE_ACTION", "Автомобиль не назначен.");
    if (!UNASSIGNABLE_STATUSES.includes(order.currentStatus)) {
      throw new AppError("INVALID_STATE_TRANSITION", "Снять автомобиль с рейса можно только до начала загрузки.");
    }
    await tx.vehicle.update({ where: { id: order.vehicleId }, data: { status: "AVAILABLE" } });
    await tx.transportOrder.update({ where: { id: orderId }, data: { vehicleId: null, driverId: null } });
    if (order.driver?.userId) {
      await tx.transportOrderParticipant.deleteMany({ where: { orderId, role: "DRIVER" } });
    }
    await performTransitionInTx(tx, {
      orderId,
      to: "CONTRACT_SIGNED",
      side: access.side,
      actor,
      source: "WEB",
      comment: `Автомобиль ${order.vehicle?.plateNumber} снят с рейса${order.driver ? `, водитель ${order.driver.fullName} снят` : ""}`,
    });
    await audit(
      actor,
      {
        action: AuditAction.VEHICLE_UNASSIGNED,
        entityType: "TransportOrder",
        entityId: orderId,
        oldValue: { vehicleId: order.vehicleId, driverId: order.driverId },
      },
      tx,
    );
    return { ok: true };
  });
}

export async function driverOptionsForOrder(actor: Actor, orderId: string) {
  const { order } = await requireOrderAccess(actor, orderId, "ORDER_ASSIGN_DRIVER");
  const full = await prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId }, select: { loadingDate: true, deliveryDate: true } });
  const win = orderWindow(full);
  const drivers = await prisma.driverProfile.findMany({
    where: { companyId: order.carrierCompanyId, deletedAt: null },
    orderBy: { fullName: "asc" },
    include: {
      orders: {
        where: { currentStatus: { in: RESOURCE_BUSY_STATUSES }, id: { not: orderId } },
        select: { id: true, publicNumber: true, loadingDate: true, deliveryDate: true, currentStatus: true },
      },
    },
  });
  return drivers.map((d) => {
    const problems: string[] = [];
    if (d.status !== "ACTIVE") problems.push("Водитель неактивен");
    const conflicts = d.orders.filter((o) => {
      const w = orderWindow(o);
      return w.start <= win.end && w.end >= win.start;
    });
    if (conflicts.length) problems.push(`Конфликт с рейсом ${conflicts.map((c) => c.publicNumber).join(", ")}`);
    if (d.licenseExpiry && d.licenseExpiry < win.end) problems.push("Срок действия удостоверения истекает до окончания рейса");
    if (!d.userId) problems.push("Нет доступа к приложению водителя (пригласите водителя)");
    return {
      id: d.id,
      fullName: d.fullName,
      phone: d.phone,
      status: d.status,
      licenseCategory: d.licenseCategory,
      licenseExpiry: d.licenseExpiry,
      hasAccount: Boolean(d.userId),
      activeTrips: d.orders.map((o) => ({ id: o.id, publicNumber: o.publicNumber, status: o.currentStatus })),
      available: problems.length === 0,
      problems,
    };
  });
}

export async function assignDriver(actor: Actor, orderId: string, driverId: string) {
  const { access } = await requireOrderAccess(actor, orderId, "ORDER_ASSIGN_DRIVER");
  if (access.side !== "CARRIER" && access.side !== "ADMIN") throw errors.forbidden("Назначать водителя может только перевозчик.");

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId }, include: { vehicle: true } });
    if (order.driverId === driverId) throw new AppError("DUPLICATE_ACTION", "Этот водитель уже назначен на рейс.");
    if (order.currentStatus !== "VEHICLE_ASSIGNED") {
      if (order.currentStatus === "CONTRACT_SIGNED") throw new AppError("INVALID_STATE_TRANSITION", "Сначала назначьте автомобиль.");
      if (order.driverId) throw new AppError("INVALID_STATE_TRANSITION", "Водитель уже назначен. Сначала снимите текущего водителя.");
      throw new AppError("INVALID_STATE_TRANSITION", `Нельзя назначить водителя в статусе «${ORDER_STATUS_LABELS[order.currentStatus]}».`);
    }
    await tx.$queryRaw`SELECT id FROM "DriverProfile" WHERE id = ${driverId}::uuid FOR UPDATE`;
    const driver = await tx.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver || driver.deletedAt || driver.companyId !== order.carrierCompanyId)
      throw errors.notFound("Водитель не найден в вашей компании.");
    if (driver.status !== "ACTIVE") throw new AppError("DRIVER_UNAVAILABLE", "Водитель неактивен или отстранён.");
    if (!driver.userId)
      throw new AppError("DRIVER_UNAVAILABLE", "У водителя нет доступа к приложению. Отправьте ему приглашение в разделе «Водители».");
    const win = orderWindow(order);
    const busy = await tx.transportOrder.findMany({
      where: { driverId, id: { not: orderId }, currentStatus: { in: RESOURCE_BUSY_STATUSES } },
      select: { publicNumber: true, loadingDate: true, deliveryDate: true },
    });
    const conflict = busy.find((o) => {
      const w = orderWindow(o);
      return w.start <= win.end && w.end >= win.start;
    });
    if (conflict) throw new AppError("DRIVER_UNAVAILABLE", `Водитель уже назначен на другой активный рейс (${conflict.publicNumber}).`);
    if (driver.licenseExpiry && driver.licenseExpiry < win.end) {
      throw new AppError("DRIVER_UNAVAILABLE", "Срок действия водительского удостоверения истекает до окончания рейса.");
    }

    await tx.transportOrder.update({ where: { id: orderId }, data: { driverId } });
    await tx.transportOrderParticipant.deleteMany({ where: { orderId, role: "DRIVER" } });
    await tx.transportOrderParticipant.create({
      data: { orderId, companyId: order.carrierCompanyId, userId: driver.userId, role: "DRIVER" },
    });
    await performTransitionInTx(tx, {
      orderId,
      to: "DRIVER_ASSIGNED",
      side: access.side,
      actor,
      source: "WEB",
      comment: `Назначен водитель ${driver.fullName}`,
      silent: true,
    });
    await performTransitionInTx(tx, {
      orderId,
      to: "WAITING_FOR_LOADING",
      side: "SYSTEM",
      actor,
      source: "SYSTEM",
      comment: "Рейс передан водителю",
      silent: true,
    });
    await audit(
      actor,
      {
        action: AuditAction.DRIVER_ASSIGNED,
        entityType: "TransportOrder",
        entityId: orderId,
        newValue: { driverId, fullName: driver.fullName },
      },
      tx,
    );
    await notify(tx, {
      userIds: [driver.userId],
      type: "DRIVER_ASSIGNED",
      title: `Вам назначен рейс ${order.publicNumber}`,
      body: `Автомобиль ${order.vehicle?.plateNumber ?? ""}. Откройте «Мой рейс».`,
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/driver`,
    });
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, order, { customer: true, carrier: true }),
      excludeUserId: actor.userId,
      type: "DRIVER_ASSIGNED",
      title: `${order.publicNumber}: назначен водитель`,
      body: `${driver.fullName}. Рейс ожидает загрузки.`,
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}`,
    });
    return { driverId };
  });
}

export async function unassignDriver(actor: Actor, orderId: string) {
  const { access } = await requireOrderAccess(actor, orderId, "ORDER_ASSIGN_DRIVER");
  if (access.side !== "CARRIER" && access.side !== "ADMIN") throw errors.forbidden("Снять водителя может только перевозчик.");
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId }, include: { driver: true } });
    if (!order.driverId) throw new AppError("DUPLICATE_ACTION", "Водитель не назначен.");
    if (order.currentStatus !== "DRIVER_ASSIGNED" && order.currentStatus !== "WAITING_FOR_LOADING") {
      throw new AppError("INVALID_STATE_TRANSITION", "Снять водителя можно только до начала загрузки.");
    }
    await tx.transportOrder.update({ where: { id: orderId }, data: { driverId: null } });
    await tx.transportOrderParticipant.deleteMany({ where: { orderId, role: "DRIVER" } });
    await performTransitionInTx(tx, {
      orderId,
      to: "VEHICLE_ASSIGNED",
      side: access.side,
      actor,
      source: "WEB",
      comment: `Водитель ${order.driver?.fullName} снят с рейса`,
    });
    await audit(
      actor,
      { action: AuditAction.DRIVER_UNASSIGNED, entityType: "TransportOrder", entityId: orderId, oldValue: { driverId: order.driverId } },
      tx,
    );
    if (order.driver?.userId) {
      await notify(tx, {
        userIds: [order.driver.userId],
        type: "STATUS_CHANGED",
        title: `Вы сняты с рейса ${order.publicNumber}`,
        entityType: "TransportOrder",
        entityId: orderId,
        link: "/driver",
      });
    }
    return { ok: true };
  });
}

// ─────────── Доставка и закрытие ───────────

/** Водитель/перевозчик отмечает доставку (с фото, CMR, комментарием). */
export async function reportDelivered(
  actor: Actor,
  orderId: string,
  input: { comment: string | null; documentIds: string[]; latitude?: number | null; longitude?: number | null; accuracy?: number | null },
) {
  const { access, order } = await requireOrderAccess(actor, orderId, "ORDER_STATUS_UPDATE");
  if (access.side !== "DRIVER" && access.side !== "CARRIER" && access.side !== "ADMIN") {
    throw errors.forbidden("Отметить доставку может водитель или перевозчик.");
  }
  if (order.currentStatus === "DELIVERED") throw new AppError("DUPLICATE_ACTION", "Доставка уже отмечена.");
  if (order.currentStatus !== "AT_DELIVERY") {
    throw new AppError("DELIVERY_NOT_ALLOWED", "Отметить доставку можно только после прибытия на разгрузку.");
  }
  await validateAttachments(orderId, input.documentIds);
  return prisma.$transaction(async (tx) => {
    const ev = await tx.trackingEvent.create({
      data: {
        orderId,
        userId: actor.userId,
        type: "DELIVERED",
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
        note: input.comment,
        source: access.side === "DRIVER" ? "DRIVER_APP" : "WEB",
      },
    });
    const { order: updated } = await performTransitionInTx(tx, {
      orderId,
      to: "DELIVERED",
      side: access.side,
      actor,
      source: access.side === "DRIVER" ? "DRIVER_APP" : "WEB",
      comment: input.comment ?? "Груз доставлен",
      trackingEventId: ev.id,
      documentIds: input.documentIds,
      expectedFrom: "AT_DELIVERY",
      silent: true,
    });
    await audit(
      actor,
      {
        action: AuditAction.DELIVERY_REPORTED,
        entityType: "TransportOrder",
        entityId: orderId,
        newValue: { documentIds: input.documentIds, comment: input.comment },
      },
      tx,
    );
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, updated, { customer: true, carrier: true }),
      excludeUserId: actor.userId,
      type: "STATUS_CHANGED",
      title: `${updated.publicNumber}: груз доставлен`,
      body: "Проверьте документы и подтвердите получение груза.",
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}`,
    });
    return updated;
  });
}

/** Заказчик подтверждает получение → CLOSED. Финансовый учёт обновляется. */
export async function confirmDelivery(actor: Actor, orderId: string, comment: string | null) {
  const { access, order } = await requireOrderAccess(actor, orderId, "ORDER_CONFIRM_DELIVERY");
  if (access.side !== "CUSTOMER" && access.side !== "ADMIN") throw errors.forbidden("Подтвердить получение может только заказчик.");
  if (order.currentStatus === "CLOSED") throw new AppError("ORDER_ALREADY_CLOSED", "Получение уже подтверждено, перевозка закрыта.");
  if (order.currentStatus !== "DELIVERED") {
    throw new AppError("DELIVERY_NOT_ALLOWED", "Подтвердить получение можно после того, как перевозчик отметит доставку.");
  }
  const settings = await getSettings();
  if (settings.requirePodForClose) {
    const pod = await prisma.orderDocument.count({ where: { orderId, status: "ACTIVE", type: { in: ["PROOF_OF_DELIVERY", "CMR"] } } });
    if (pod === 0) {
      throw new AppError("DELIVERY_NOT_ALLOWED", "Нельзя закрыть перевозку без подтверждения доставки: загрузите POD или подписанную CMR.");
    }
  }
  return prisma.$transaction(async (tx) => {
    const { order: closed } = await performTransitionInTx(tx, {
      orderId,
      to: "CLOSED",
      side: access.side,
      actor,
      source: "WEB",
      comment: comment ?? "Получение груза подтверждено заказчиком",
      expectedFrom: "DELIVERED",
      silent: true,
    });
    await tx.trackingEvent.create({
      data: { orderId, userId: actor.userId, type: "DELIVERED", source: "WEB", note: "Получение подтверждено заказчиком" },
    });
    // Финансы: фиксируем окончательный расчёт на остаток, если он ещё не запланирован
    const payments = await tx.paymentRecord.findMany({ where: { orderId, status: { not: "CANCELLED" } } });
    const summary = financeSummary(
      Number(closed.agreedAmount),
      closed.currency,
      payments.map((p) => ({ amount: Number(p.amount), status: p.status, type: p.type, currency: p.currency })),
    );
    const plannedOrInvoiced = payments
      .filter((p) => p.currency === closed.currency && p.status !== "PAID")
      .reduce((a, p) => a + Number(p.amount), 0);
    const toPlan = Math.round((summary.outstanding - plannedOrInvoiced) * 100) / 100;
    if (toPlan > 0) {
      await tx.paymentRecord.create({
        data: {
          orderId,
          payerCompanyId: closed.shipperCompanyId,
          payeeCompanyId: closed.carrierCompanyId,
          amount: toPlan,
          currency: closed.currency,
          type: "FINAL_PAYMENT",
          status: "INVOICED",
          note: "Окончательный расчёт сформирован автоматически после подтверждения доставки",
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60_000),
          createdByUserId: actor.userId,
        },
      });
      await audit(
        actor,
        {
          action: AuditAction.PAYMENT_CREATED,
          entityType: "TransportOrder",
          entityId: orderId,
          newValue: { type: "FINAL_PAYMENT", amount: toPlan, currency: closed.currency, auto: true },
        },
        tx,
      );
    }
    await audit(
      actor,
      { action: AuditAction.DELIVERY_CONFIRMED, entityType: "TransportOrder", entityId: orderId, newValue: { comment } },
      tx,
    );
    await audit(
      actor,
      { action: AuditAction.ORDER_CLOSED, entityType: "TransportOrder", entityId: orderId, newValue: { status: "CLOSED" } },
      tx,
    );
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, closed),
      excludeUserId: actor.userId,
      type: "DELIVERY_CONFIRMED",
      title: `${closed.publicNumber}: получение подтверждено`,
      body: "Перевозка закрыта. Оставьте отзыв о работе контрагента.",
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}`,
    });
    return closed;
  });
}

/** Изменение цены после подписания — только через администратора (точка расширения для Amendment). */
export async function requestPriceChange(actor: Actor, orderId: string) {
  const { order } = await requireOrderAccess(actor, orderId);
  const signedOrLater = !["CARRIER_SELECTED", "CONTRACT_PENDING"].includes(order.currentStatus);
  if (signedOrLater) {
    throw new AppError("FORBIDDEN", "Для изменения цены после подписания обратитесь к администратору.");
  }
  throw new AppError(
    "FORBIDDEN",
    "Цена согласована при принятии предложения. Для изменения отмените сделку до подписания или обратитесь к администратору.",
  );
}

export type { OrderSide };
export { performTransitionInTx };

/** Администратор: возобновить перевозку после спора/паузы. */
export async function resumeOrder(actor: Actor, orderId: string, comment: string | null, tx?: Tx) {
  if (!actor.isAdmin) throw errors.forbidden();
  const run = async (t: Tx) => {
    const order = await t.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.previousStatus || (order.currentStatus !== "DISPUTED" && order.currentStatus !== "ON_HOLD")) {
      throw new AppError("INVALID_STATE_TRANSITION", "Перевозка не приостановлена.");
    }
    return performTransitionInTx(t, {
      orderId,
      to: order.previousStatus,
      side: "ADMIN",
      actor,
      source: "WEB",
      comment: comment ?? "Перевозка возобновлена администратором",
    });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
