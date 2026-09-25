import "server-only";
import type { ActionSource, ActorType, OrderStatus } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import type { Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { canTransition, ORDER_STATUS_LABELS, type ActorSide } from "@/lib/state-machine/order-state-machine";
import { CARRIER_OFFICE_ROLES, companyUserIds, CUSTOMER_ROLES, notify } from "./notification.service";

export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "TransportOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
}

/** Все пользователи-участники сделки (офис заказчика, офис перевозчика, водитель). */
export async function orderParticipantUserIds(
  tx: Tx,
  order: { shipperCompanyId: string; carrierCompanyId: string; forwarderCompanyId: string | null; driverId: string | null },
  opts: { customer?: boolean; carrier?: boolean; driver?: boolean } = { customer: true, carrier: true, driver: true },
) {
  const ids: string[] = [];
  if (opts.customer) {
    ids.push(...(await companyUserIds(tx, order.shipperCompanyId, CUSTOMER_ROLES)));
    if (order.forwarderCompanyId && order.forwarderCompanyId !== order.shipperCompanyId)
      ids.push(...(await companyUserIds(tx, order.forwarderCompanyId, CUSTOMER_ROLES)));
  }
  if (opts.carrier) ids.push(...(await companyUserIds(tx, order.carrierCompanyId, CARRIER_OFFICE_ROLES)));
  if (opts.driver && order.driverId) {
    const d = await tx.driverProfile.findUnique({ where: { id: order.driverId }, select: { userId: true } });
    if (d?.userId) ids.push(d.userId);
  }
  return [...new Set(ids)];
}

const ACTOR_TYPE: Record<ActorSide, ActorType> = {
  CUSTOMER: "USER",
  CARRIER: "USER",
  DRIVER: "DRIVER",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
};

export type TransitionInput = {
  orderId: string;
  to: OrderStatus;
  side: ActorSide;
  actor: Actor | null;
  source: ActionSource;
  comment?: string | null;
  trackingEventId?: string | null;
  documentIds?: string[];
  /** Переход запрошен через общий endpoint — разрешены только «ручные» переходы. */
  manual?: boolean;
  /** Не отправлять уведомление STATUS_CHANGED (если операция шлёт своё). */
  silent?: boolean;
  /** Ожидаемый текущий статус (оптимистичная проверка повторов). */
  expectedFrom?: OrderStatus;
};

/**
 * Выполняет переход статуса заказа внутри транзакции:
 * блокировка строки → проверка state machine → обновление → история → аудит → уведомления.
 */
export async function performTransitionInTx(tx: Tx, input: TransitionInput) {
  await lockOrder(tx, input.orderId);
  const order = await tx.transportOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw errors.notFound("Перевозка не найдена.");
  const from = order.currentStatus;

  if (input.expectedFrom && input.expectedFrom !== from) {
    if (from === input.to) throw new AppError("DUPLICATE_ACTION", `Статус уже изменён на «${ORDER_STATUS_LABELS[from]}».`);
    throw new AppError("INVALID_STATE_TRANSITION", `Статус перевозки уже изменился: «${ORDER_STATUS_LABELS[from]}». Обновите страницу.`);
  }
  if (from === input.to) throw new AppError("DUPLICATE_ACTION", `Перевозка уже в статусе «${ORDER_STATUS_LABELS[from]}».`);
  if (from === "CLOSED") throw new AppError("ORDER_ALREADY_CLOSED", "Перевозка уже закрыта.");

  const check = canTransition(from, input.to, input.side, { manual: input.manual, previousStatus: order.previousStatus });
  if (!check.ok) throw new AppError("INVALID_STATE_TRANSITION", check.reason);

  const now = new Date();
  const pausing = input.to === "DISPUTED" || input.to === "ON_HOLD";
  const resuming = (from === "DISPUTED" || from === "ON_HOLD") && input.to === order.previousStatus;
  const updated = await tx.transportOrder.update({
    where: { id: order.id },
    data: {
      currentStatus: input.to,
      previousStatus: pausing ? from : resuming ? null : order.previousStatus,
      statusChangedAt: now,
      ...(input.to === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(input.to === "CLOSED" ? { closedAt: now } : {}),
      ...(input.to === "CANCELLED" ? { cancelledAt: now } : {}),
    },
  });
  await tx.transportOrderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: from,
      toStatus: input.to,
      actorUserId: input.actor?.userId ?? null,
      actorType: ACTOR_TYPE[input.side],
      source: input.source,
      comment: input.comment ?? null,
      trackingEventId: input.trackingEventId ?? null,
      documentIds: input.documentIds ?? [],
    },
  });
  await audit(
    input.actor,
    {
      action: AuditAction.STATUS_CHANGED,
      entityType: "TransportOrder",
      entityId: order.id,
      companyId: input.actor?.active?.companyId ?? null,
      oldValue: { status: from },
      newValue: { status: input.to, comment: input.comment ?? undefined, source: input.source },
    },
    tx,
  );

  // Освобождение ресурсов при завершении сделки
  if (input.to === "CLOSED" || input.to === "CANCELLED") {
    if (order.vehicleId) {
      await tx.vehicle.updateMany({ where: { id: order.vehicleId, status: "ASSIGNED" }, data: { status: "AVAILABLE" } });
    }
  }

  if (!input.silent) {
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, order),
      excludeUserId: input.actor?.userId,
      type: "STATUS_CHANGED",
      title: `${order.publicNumber}: ${ORDER_STATUS_LABELS[input.to]}`,
      body: input.comment ?? `Статус перевозки изменён: «${ORDER_STATUS_LABELS[from]}» → «${ORDER_STATUS_LABELS[input.to]}».`,
      entityType: "TransportOrder",
      entityId: order.id,
      link: `/orders/${order.id}`,
    });
  }
  return { order: updated, from };
}
