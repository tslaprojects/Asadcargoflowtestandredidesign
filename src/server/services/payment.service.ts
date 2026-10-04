import "server-only";
import type { z } from "zod";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { financeSummary, formatMoney, toMinor } from "@/lib/money";
import { label } from "@/lib/i18n";
import type { paymentCreateSchema, paymentUpdateSchema } from "@/lib/validation/order";
import { ordersWhereForActor, requireOrderAccess } from "./access";
import { notify } from "./notification.service";
import { orderParticipantUserIds } from "./order-core";
import { findLiveSecureDeal } from "./secure-deal.service";

export async function listPayments(actor: Actor, orderId: string) {
  const { order } = await requireOrderAccess(actor, orderId, "PAYMENT_VIEW");
  const items = await prisma.paymentRecord.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  const summary = financeSummary(
    Number(order.agreedAmount),
    order.currency,
    items.map((p) => ({
      amount: Number(p.amount),
      status: p.status,
      type: p.type,
      currency: p.currency,
      releasedAmount: Number(p.releasedAmount),
      refundedAmount: Number(p.refundedAmount),
    })),
  );
  return { items, summary };
}

export async function createPayment(actor: Actor, orderId: string, input: z.output<typeof paymentCreateSchema>) {
  const { access, order } = await requireOrderAccess(actor, orderId, "PAYMENT_EDIT");
  if (access.side === "DRIVER") throw errors.forbidden();
  if (order.currentStatus === "CANCELLED") throw new AppError("INVALID_STATE_TRANSITION", "Перевозка отменена — платежи не добавляются.");
  if (await findLiveSecureDeal(prisma, orderId)) {
    throw new AppError("CONFLICT", "По перевозке оформлена безопасная сделка — расчёты ведутся через неё, ручные записи не добавляются.");
  }
  // Факт оплаты подтверждает получатель (перевозчик) или администратор — не плательщик в одностороннем порядке
  if (input.status === "PAID" && access.side !== "CARRIER" && access.side !== "ADMIN") {
    throw errors.forbidden("Отметить платёж оплаченным может получатель (перевозчик). Создайте запись как «Выставлен счёт».");
  }
  if (input.currency !== order.currency) {
    throw errors.validation(`Платёж должен быть в валюте сделки (${order.currency}).`, {
      currency: ["Валюта не совпадает с валютой сделки"],
    });
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TransportOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
    const existing = await tx.paymentRecord.findMany({
      where: { orderId, type: { not: "SECURE_DEAL" }, status: { not: "CANCELLED" }, currency: order.currency },
    });
    const sum = existing.reduce((a, p) => a + toMinor(Number(p.amount)), 0) + toMinor(input.amount);
    if (sum > toMinor(Number(order.agreedAmount))) {
      throw errors.validation(
        `Сумма платежей превышает стоимость перевозки (${formatMoney(Number(order.agreedAmount), order.currency)}).`,
        { amount: ["Сумма превышает остаток по сделке"] },
      );
    }
    const payment = await tx.paymentRecord.create({
      data: {
        orderId,
        payerCompanyId: order.shipperCompanyId,
        payeeCompanyId: order.carrierCompanyId,
        amount: input.amount,
        currency: input.currency,
        type: input.type,
        status: input.status,
        dueDate: input.dueDate,
        paidAt: input.status === "PAID" ? (input.paidAt ?? new Date()) : null,
        note: input.note,
        createdByUserId: actor.userId,
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.PAYMENT_CREATED,
        entityType: "TransportOrder",
        entityId: orderId,
        companyId: access.membership?.companyId ?? null,
        newValue: { paymentId: payment.id, type: input.type, amount: input.amount, currency: input.currency, status: input.status },
      },
      tx,
    );
    const full = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, full, { customer: true, carrier: true }),
      excludeUserId: actor.userId,
      type: "PAYMENT_UPDATED",
      title: `${full.publicNumber}: ${label("PaymentType", input.type).toLowerCase()}`,
      body: `${formatMoney(input.amount, input.currency)} — ${label("PaymentStatus", input.status).toLowerCase()}`,
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}?tab=finance`,
    });
    return payment;
  });
}

export async function updatePayment(actor: Actor, paymentId: string, input: z.output<typeof paymentUpdateSchema>) {
  const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!payment) throw errors.notFound("Платёж не найден.");
  const { access } = await requireOrderAccess(actor, payment.orderId, "PAYMENT_EDIT");
  if (payment.type === "SECURE_DEAL") {
    throw errors.forbidden("Статус безопасной сделки меняется только платёжными операциями, а не вручную.");
  }
  if (access.side === "DRIVER") throw errors.forbidden();
  if (payment.status === "CANCELLED") throw new AppError("INVALID_STATE_TRANSITION", "Отменённый платёж изменить нельзя.");
  if (payment.status === "PAID" && access.side !== "ADMIN") {
    throw errors.forbidden("Оплаченный платёж может изменить только администратор.");
  }
  if (input.status === "PAID" && access.side !== "CARRIER" && access.side !== "ADMIN") {
    throw errors.forbidden("Получение оплаты подтверждает получатель (перевозчик).");
  }
  if (input.status === "CANCELLED" && access.side !== "ADMIN") {
    // Отменить запись может компания, которая её создала
    const creatorInMyCompany =
      payment.createdByUserId && access.membership
        ? await prisma.companyMember.count({ where: { companyId: access.membership.companyId, userId: payment.createdByUserId } })
        : 0;
    if (!creatorInMyCompany) throw errors.forbidden("Отменить запись о платеже может компания, которая её создала, или администратор.");
  }
  return prisma.$transaction(async (tx) => {
    // Блокировка записи: параллельные изменения статуса не перезапишут друг друга
    await tx.$queryRaw`SELECT id FROM "PaymentRecord" WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const fresh = await tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
    if (fresh.status !== payment.status) throw new AppError("CONFLICT", "Платёж уже изменён. Обновите страницу.");
    const updated = await tx.paymentRecord.update({
      where: { id: paymentId },
      data: {
        status: input.status,
        paidAt: input.status === "PAID" ? (input.paidAt ?? payment.paidAt ?? new Date()) : null,
        note: input.note ?? payment.note,
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.PAYMENT_UPDATED,
        entityType: "TransportOrder",
        entityId: payment.orderId,
        companyId: access.membership?.companyId ?? null,
        oldValue: { paymentId, status: payment.status },
        newValue: { paymentId, status: input.status },
      },
      tx,
    );
    const full = await tx.transportOrder.findUniqueOrThrow({ where: { id: payment.orderId } });
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, full, { customer: true, carrier: true }),
      excludeUserId: actor.userId,
      type: "PAYMENT_UPDATED",
      title: `${full.publicNumber}: платёж ${label("PaymentStatus", input.status).toLowerCase()}`,
      body: formatMoney(Number(payment.amount), payment.currency),
      entityType: "TransportOrder",
      entityId: payment.orderId,
      link: `/orders/${payment.orderId}?tab=finance`,
    });
    return updated;
  });
}

/** Финансовый раздел: все платежи по сделкам пользователя. */
export async function listMyPayments(actor: Actor, opts: { page: number; pageSize: number; status?: string }) {
  if (!actor.permissions.has("PAYMENT_VIEW")) throw errors.forbidden("Финансовые данные недоступны для вашей роли.");
  const orderWhere = ordersWhereForActor(actor);
  const where = { order: orderWhere, ...(opts.status ? { status: opts.status as "PLANNED" } : {}) };
  const [items, total, orders] = await Promise.all([
    prisma.paymentRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        order: {
          select: {
            id: true,
            publicNumber: true,
            currentStatus: true,
            agreedAmount: true,
            currency: true,
            carrier: { select: { legalName: true } },
            load: { select: { originCity: true, destinationCity: true } },
          },
        },
        payer: { select: { legalName: true } },
        payee: { select: { legalName: true } },
      },
    }),
    prisma.paymentRecord.count({ where }),
    prisma.transportOrder.findMany({
      where: { AND: [orderWhere, { currentStatus: { notIn: ["CANCELLED"] } }] },
      select: {
        agreedAmount: true,
        currency: true,
        payments: { select: { amount: true, status: true, type: true, currency: true, releasedAmount: true, refundedAmount: true } },
      },
    }),
  ]);
  // Итоги по валютам
  const totals: Record<string, { contracted: number; paid: number; outstanding: number }> = {};
  for (const o of orders) {
    const s = financeSummary(
      Number(o.agreedAmount),
      o.currency,
      o.payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
        releasedAmount: Number(p.releasedAmount),
        refundedAmount: Number(p.refundedAmount),
      })),
    );
    const t = (totals[o.currency] ??= { contracted: 0, paid: 0, outstanding: 0 });
    t.contracted += s.total;
    t.paid += s.paid;
    t.outstanding += s.outstanding;
  }
  return { items, total, page: opts.page, pageSize: opts.pageSize, totals };
}
