import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentTransactionKind } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import { commissionRuleFor, computeCommission, feeForRelease } from "@/lib/payments/commission";
import { getPaymentProvider, providerByCode, type PaymentProvider, type ProviderResult } from "@/lib/payments/provider";
import { releaseConditions } from "@/lib/payments/release-conditions";
import {
  canPaymentTransition,
  HELD_STATUSES,
  heldMinor,
  LIVE_STATUSES,
  PAYMENT_STATUS_LABELS,
  statusAfterMovement,
  UNSECURED_STATUSES,
  type PaymentActor,
  type SecureDealStatus,
} from "@/lib/state-machine/payment-state-machine";
import { toPlain } from "@/lib/serialize";
import { requireOrderAccess } from "./access";
import { notify } from "./notification.service";
import { lockOrder, orderParticipantUserIds, performTransitionInTx } from "./order-core";
import { getSettings } from "./settings.service";

/**
 * Безопасная сделка (Secure Deal).
 *
 * CargoFlow отвечает за: сумму, условия выплаты, статусы, события, документы, подтверждение доставки, споры и журнал.
 * Движение денег выполняет платёжный провайдер (src/lib/payments/provider.ts). Каждая операция у провайдера
 * записывается в PaymentTransaction с ключом идемпотентности; статусы RESERVED/RELEASED/REFUNDED выставляются
 * только по результату операции (actor = PROVIDER).
 *
 * Жизненный цикл операции:
 *   1) транзакция БД: блокировка платежа → проверка state machine → запись операции PENDING (уникальный индекс:
 *      не более одной незавершённой операции на платёж → защита от двойной выплаты/возврата);
 *   2) вызов провайдера вне транзакции БД;
 *   3) транзакция БД: применение результата (идемпотентно — повторный результат игнорируется).
 */

/** До начала загрузки заказчик может оформить безопасную сделку. */
export const SECURE_DEAL_INITIATE_STATUSES: OrderStatus[] = [
  "CARRIER_SELECTED",
  "CONTRACT_PENDING",
  "CONTRACT_SIGNED",
  "VEHICLE_ASSIGNED",
  "DRIVER_ASSIGNED",
  "WAITING_FOR_LOADING",
];

type PaymentRow = Prisma.PaymentRecordGetPayload<object>;

const n = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

function amounts(p: PaymentRow) {
  return { amountMinor: toMinor(n(p.amount)), releasedMinor: toMinor(n(p.releasedAmount)), refundedMinor: toMinor(n(p.refundedAmount)) };
}

export function heldAmount(p: PaymentRow) {
  return fromMinor(heldMinor(amounts(p)));
}

export async function findLiveSecureDeal(db: Tx, orderId: string) {
  return db.paymentRecord.findFirst({ where: { orderId, type: "SECURE_DEAL", status: { in: LIVE_STATUSES } } });
}

async function lockPayment(tx: Tx, paymentId: string) {
  await tx.$queryRaw`SELECT id FROM "PaymentRecord" WHERE id = ${paymentId}::uuid FOR UPDATE`;
  const p = await tx.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!p || p.type !== "SECURE_DEAL") throw errors.notFound("Безопасная сделка не найдена.");
  return p;
}

async function adminIds(tx: Tx) {
  const admins = await tx.user.findMany({ where: { platformRole: "PLATFORM_ADMIN", status: "ACTIVE" }, select: { id: true } });
  return admins.map((a) => a.id);
}

const ACTOR_TYPE: Record<PaymentActor, "USER" | "ADMIN" | "SYSTEM"> = {
  PAYER: "USER",
  PAYEE: "USER",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
  PROVIDER: "SYSTEM",
};

/** Единственная точка смены статуса безопасной сделки: state machine → обновление → история → аудит. */
async function transitionPayment(
  tx: Tx,
  payment: PaymentRow,
  to: SecureDealStatus,
  by: PaymentActor,
  opts: { actor: Actor | null; reason?: string | null; transactionId?: string | null; data?: Prisma.PaymentRecordUpdateInput } = {
    actor: null,
  },
) {
  const from = payment.status as SecureDealStatus;
  const check = canPaymentTransition(from, to, by);
  if (!check.ok) throw new AppError("INVALID_STATE_TRANSITION", check.reason);
  const updated = await tx.paymentRecord.update({ where: { id: payment.id }, data: { ...opts.data, status: to } });
  await tx.paymentStatusHistory.create({
    data: {
      paymentId: payment.id,
      fromStatus: from,
      toStatus: to,
      actorUserId: opts.actor?.userId ?? null,
      actorType: ACTOR_TYPE[by],
      reason: opts.reason ?? null,
      transactionId: opts.transactionId ?? null,
    },
  });
  await audit(
    opts.actor,
    {
      action: AuditAction.PAYMENT_STATUS_CHANGED,
      entityType: "TransportOrder",
      entityId: payment.orderId,
      companyId: opts.actor?.active?.companyId ?? null,
      oldValue: { paymentId: payment.id, status: from },
      newValue: { paymentId: payment.id, status: to, by, reason: opts.reason ?? undefined },
    },
    tx,
  );
  return updated;
}

async function notifyParties(tx: Tx, orderId: string, title: string, body: string, opts: { admins?: boolean; exclude?: string } = {}) {
  const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
  await notify(tx, {
    userIds: [...(await orderParticipantUserIds(tx, order, { customer: true, carrier: true })), ...(opts.admins ? await adminIds(tx) : [])],
    excludeUserId: opts.exclude,
    type: "PAYMENT_UPDATED",
    title: `${order.publicNumber}: ${title}`,
    body,
    entityType: "TransportOrder",
    entityId: orderId,
    link: `/orders/${orderId}?tab=finance`,
  });
}

function providerFor(payment: PaymentRow): PaymentProvider {
  return (payment.provider && providerByCode(payment.provider)) || getPaymentProvider();
}

// ─────────── Операции у провайдера ───────────

type OperationInput = {
  paymentId: string;
  kind: PaymentTransactionKind;
  /** Для RELEASE / REFUND; по умолчанию — весь удерживаемый остаток */
  amount?: number;
  by: PaymentActor;
  actor: Actor | null;
  reason: string;
};

const ALLOWED_REQUESTERS: Record<PaymentTransactionKind, PaymentActor[]> = {
  AUTHORIZE: ["PAYER", "SYSTEM", "ADMIN"],
  RESERVE: ["PAYER", "SYSTEM", "ADMIN"],
  VOID: ["PAYER", "SYSTEM", "ADMIN"],
  // Выплата и возврат — только по выполнению условий (система) или решению администратора
  RELEASE: ["SYSTEM", "ADMIN"],
  REFUND: ["SYSTEM", "ADMIN"],
};

/**
 * Запрос операции у провайдера. Возвращает итоговое состояние платежа.
 * Повторный запрос во время незавершённой операции отклоняется (DUPLICATE_ACTION).
 */
export async function requestOperation(input: OperationInput) {
  if (!ALLOWED_REQUESTERS[input.kind].includes(input.by)) {
    throw errors.forbidden("Эта платёжная операция выполняется только системой или администратором.");
  }
  let prepared: { transactionId: string; provider: PaymentProvider; request: Parameters<PaymentProvider["execute"]>[0] };
  try {
    prepared = await prisma.$transaction(async (tx) => {
      const p = await lockPayment(tx, input.paymentId);
      const status = p.status as SecureDealStatus;
      const pending = await tx.paymentTransaction.findFirst({ where: { paymentId: p.id, status: "PENDING" } });
      if (pending) {
        throw new AppError("DUPLICATE_ACTION", "По платежу уже выполняется операция у провайдера. Дождитесь её завершения.");
      }
      const held = heldAmount(p);
      let amount = n(p.amount);
      let fee = 0;
      switch (input.kind) {
        case "AUTHORIZE":
          if (status !== "PAYMENT_PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Платёж уже авторизован или обработан.");
          break;
        case "RESERVE":
          if (status !== "PAYMENT_PENDING" && status !== "PAYMENT_AUTHORIZED") {
            throw new AppError("INVALID_STATE_TRANSITION", "Оплата уже обеспечена или сделка завершена.");
          }
          break;
        case "VOID":
          if (status !== "PAYMENT_AUTHORIZED") throw new AppError("INVALID_STATE_TRANSITION", "Снять можно только авторизованный платёж.");
          break;
        case "RELEASE":
        case "REFUND": {
          if (!HELD_STATUSES.includes(status)) {
            throw new AppError("INVALID_STATE_TRANSITION", `Операция невозможна: платёж в статусе «${PAYMENT_STATUS_LABELS[status]}».`);
          }
          amount = input.amount ?? held;
          if (!(toMinor(amount) > 0)) throw errors.validation("Сумма операции должна быть больше 0.", { amount: ["Больше 0"] });
          if (toMinor(amount) > toMinor(held)) {
            throw errors.validation(`Сумма превышает удерживаемый остаток (${formatMoney(held, p.currency)}).`, {
              amount: ["Больше остатка"],
            });
          }
          if (input.kind === "RELEASE") {
            fee = feeForRelease(
              { amount: n(p.amount), platformFee: n(p.platformFee), releasedAmount: n(p.releasedAmount), feeCollected: n(p.feeCollected) },
              amount,
            );
            // Полная выплата остатка → «выплата в обработке»; частичная — статус меняется по результату провайдера
            if (toMinor(amount) === toMinor(held) && status !== "PAYMENT_RELEASE_PENDING") {
              await transitionPayment(tx, p, "PAYMENT_RELEASE_PENDING", input.by, {
                actor: input.actor,
                reason: input.reason,
                data: { releaseRequestedAt: new Date(), failureReason: null },
              });
            }
          }
          break;
        }
      }
      const provider = providerFor(p);
      const seq = (await tx.paymentTransaction.count({ where: { paymentId: p.id, kind: input.kind } })) + 1;
      const idempotencyKey = `${p.id}:${input.kind}:${seq}`;
      const t = await tx.paymentTransaction.create({
        data: {
          paymentId: p.id,
          kind: input.kind,
          amount,
          fee,
          currency: p.currency,
          provider: provider.code,
          idempotencyKey,
          requestedByUserId: input.actor?.userId ?? null,
          reason: input.reason,
        },
      });
      await audit(
        input.actor,
        {
          action: AuditAction.PAYMENT_OPERATION_REQUESTED,
          entityType: "TransportOrder",
          entityId: p.orderId,
          companyId: input.actor?.active?.companyId ?? null,
          newValue: { paymentId: p.id, transactionId: t.id, kind: input.kind, amount, fee, currency: p.currency, provider: provider.code },
        },
        tx,
      );
      const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: p.orderId }, select: { publicNumber: true } });
      return {
        transactionId: t.id,
        provider,
        request: {
          kind: input.kind,
          idempotencyKey,
          paymentId: p.id,
          orderNumber: order.publicNumber,
          amount,
          fee,
          currency: p.currency,
          payerCompanyId: p.payerCompanyId,
          payeeCompanyId: p.payeeCompanyId,
          reference: p.providerTransactionId,
        },
      };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE_ACTION", "По платежу уже выполняется операция у провайдера.");
    }
    throw e;
  }
  await dispatchToProvider(prepared.transactionId, prepared.provider, prepared.request, input.actor);
  return prisma.paymentRecord.findUniqueOrThrow({ where: { id: input.paymentId } });
}

async function dispatchToProvider(
  transactionId: string,
  provider: PaymentProvider,
  request: Parameters<PaymentProvider["execute"]>[0],
  actor: Actor | null,
) {
  let result: ProviderResult;
  try {
    result = await provider.execute(request);
  } catch (e) {
    // Сетевой сбой: операция остаётся PENDING и может быть повторена с тем же ключом идемпотентности
    logger.error("payment.provider.error", { transactionId, provider: provider.code, error: e });
    return;
  }
  await applyProviderResult(transactionId, result, { actor });
  await continueFlow(request.paymentId, actor);
}

/** После авторизации автоматически запрашивается резервирование. */
async function continueFlow(paymentId: string, actor: Actor | null) {
  const p = await prisma.paymentRecord.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== "PAYMENT_AUTHORIZED") return;
  const pending = await prisma.paymentTransaction.count({ where: { paymentId, status: "PENDING" } });
  if (pending > 0) return;
  await requestOperation({ paymentId, kind: "RESERVE", by: "SYSTEM", actor, reason: "Резервирование после авторизации" });
}

/**
 * Применение результата операции провайдера. Идемпотентно: результат для уже завершённой операции игнорируется.
 * Вызывается синхронно после запроса, из webhook провайдера или администратором (ручное подтверждение).
 */
export async function applyProviderResult(transactionId: string, result: ProviderResult, opts: { actor: Actor | null; manual?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const t0 = await tx.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!t0) throw errors.notFound("Операция не найдена.");
    let p = await lockPayment(tx, t0.paymentId);
    const t = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (t.status !== "PENDING") return { alreadyProcessed: true as const, payment: p };

    if (result.status === "PENDING") {
      if (result.providerTransactionId) {
        await tx.paymentTransaction.update({ where: { id: t.id }, data: { providerTransactionId: result.providerTransactionId } });
      }
      return { alreadyProcessed: false as const, payment: p };
    }

    const now = new Date();
    const moneyText = formatMoney(n(t.amount), t.currency);
    if (result.status === "FAILED") {
      await tx.paymentTransaction.update({
        where: { id: t.id },
        data: {
          status: "FAILED",
          failureReason: result.failureReason,
          providerTransactionId: result.providerTransactionId,
          completedAt: now,
        },
      });
      if (t.kind === "AUTHORIZE" || t.kind === "RESERVE") {
        p = await transitionPayment(tx, p, "PAYMENT_FAILED", "PROVIDER", {
          actor: opts.actor,
          reason: result.failureReason,
          transactionId: t.id,
          data: { failedAt: now, failureReason: result.failureReason },
        });
      } else {
        p = await tx.paymentRecord.update({ where: { id: p.id }, data: { failureReason: result.failureReason } });
      }
      await audit(
        opts.actor,
        {
          action: AuditAction.PAYMENT_OPERATION_FAILED,
          entityType: "TransportOrder",
          entityId: p.orderId,
          companyId: null,
          newValue: { paymentId: p.id, transactionId: t.id, kind: t.kind, reason: result.failureReason },
        },
        tx,
      );
      await notifyParties(tx, p.orderId, "платёжная операция отклонена", `${moneyText}: ${result.failureReason}`, { admins: true });
      return { alreadyProcessed: false as const, payment: p };
    }

    // SUCCEEDED
    await tx.paymentTransaction.update({
      where: { id: t.id },
      data: { status: "SUCCEEDED", providerTransactionId: result.providerTransactionId, completedAt: now },
    });
    const by: PaymentActor = "PROVIDER";
    const common = { actor: opts.actor, transactionId: t.id };
    const current = p.status as SecureDealStatus;
    switch (t.kind) {
      case "AUTHORIZE":
        p = await transitionPayment(tx, p, "PAYMENT_AUTHORIZED", by, {
          ...common,
          reason: "Платёж авторизован провайдером",
          data: { authorizedAt: now, providerTransactionId: result.providerTransactionId },
        });
        break;
      case "RESERVE":
        p = await transitionPayment(tx, p, "PAYMENT_RESERVED", by, {
          ...common,
          reason: "Сумма обеспечена у платёжного провайдера",
          data: { reservedAt: now, providerTransactionId: result.providerTransactionId, failureReason: null },
        });
        await notifyParties(tx, p.orderId, "оплата обеспечена", `${moneyText} зарезервировано по безопасной сделке.`);
        // Резерв подтверждён уже после доставки (например, ручное подтверждение банка) — запускаем срок проверки,
        // иначе автоподтверждение никогда не сработает и деньги останутся замороженными
        await ensureConfirmationWindow(tx, p.orderId, now);
        break;
      case "VOID":
        p = await transitionPayment(tx, p, "PAYMENT_CANCELLED", by, { ...common, reason: t.reason, data: { cancelledAt: now } });
        break;
      case "RELEASE":
      case "REFUND": {
        const isRelease = t.kind === "RELEASE";
        const next = {
          releasedAmount: fromMinor(toMinor(n(p.releasedAmount)) + (isRelease ? toMinor(n(t.amount)) : 0)),
          refundedAmount: fromMinor(toMinor(n(p.refundedAmount)) + (isRelease ? 0 : toMinor(n(t.amount)))),
          feeCollected: fromMinor(toMinor(n(p.feeCollected)) + toMinor(n(t.fee))),
        };
        const to = statusAfterMovement(current, {
          amountMinor: toMinor(n(p.amount)),
          releasedMinor: toMinor(next.releasedAmount),
          refundedMinor: toMinor(next.refundedAmount),
        });
        const data: Prisma.PaymentRecordUpdateInput = {
          ...next,
          failureReason: null,
          ...(to === "PAYMENT_RELEASED" ? { releasedAt: now, paidAt: now } : {}),
          ...(to === "PAYMENT_REFUNDED" || (!isRelease && to !== current) ? { refundedAt: now } : {}),
        };
        p =
          to !== current
            ? await transitionPayment(tx, p, to, by, { ...common, reason: t.reason, data })
            : await tx.paymentRecord.update({ where: { id: p.id }, data });
        const net = fromMinor(toMinor(n(t.amount)) - toMinor(n(t.fee)));
        await notifyParties(
          tx,
          p.orderId,
          isRelease ? "выплата перевозчику выполнена" : "возврат заказчику выполнен",
          isRelease
            ? `${moneyText}${n(t.fee) > 0 ? ` (комиссия ${formatMoney(n(t.fee), t.currency)}, к получению ${formatMoney(net, t.currency)})` : ""}.`
            : `${moneyText} возвращено заказчику.`,
        );
        break;
      }
    }
    await audit(
      opts.actor,
      {
        action: opts.manual ? AuditAction.PAYMENT_OPERATION_CONFIRMED_MANUALLY : AuditAction.PAYMENT_OPERATION_SUCCEEDED,
        entityType: "TransportOrder",
        entityId: p.orderId,
        companyId: null,
        newValue: {
          paymentId: p.id,
          transactionId: t.id,
          kind: t.kind,
          amount: n(t.amount),
          fee: n(t.fee),
          providerTransactionId: result.providerTransactionId,
          status: p.status,
        },
      },
      tx,
    );

    // Финансовая часть завершена после подтверждения получения → перевозка закрывается системой
    if (p.status === "PAYMENT_RELEASED" || p.status === "PAYMENT_REFUNDED") {
      const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: p.orderId } });
      if (order.currentStatus === "DELIVERED" && order.receiptConfirmedAt) {
        await performTransitionInTx(tx, {
          orderId: order.id,
          to: "CLOSED",
          side: "SYSTEM",
          actor: null,
          source: "SYSTEM",
          comment: "Выплата по безопасной сделке подтверждена провайдером — перевозка закрыта",
          expectedFrom: "DELIVERED",
          silent: true,
        });
        await audit(
          null,
          {
            action: AuditAction.ORDER_CLOSED,
            entityType: "TransportOrder",
            entityId: order.id,
            newValue: { status: "CLOSED", by: "SYSTEM" },
          },
          tx,
        );
        await notify(tx, {
          userIds: await orderParticipantUserIds(tx, order),
          type: "DELIVERY_CONFIRMED",
          title: `${order.publicNumber}: перевозка закрыта`,
          body: "Получение подтверждено, выплата перевозчику выполнена. Оставьте отзыв о работе контрагента.",
          entityType: "TransportOrder",
          entityId: order.id,
          link: `/orders/${order.id}`,
        });
      }
    }
    return { alreadyProcessed: false as const, payment: p };
  });
}

// ─────────── Команды участников ───────────

/** Заказчик оформляет безопасную сделку: сумма и валюта берутся из сделки, клиент их не передаёт. */
export async function initiateSecureDeal(actor: Actor, orderId: string) {
  const { access, order } = await requireOrderAccess(actor, orderId, "SECURE_DEAL_INITIATE");
  if (access.side !== "CUSTOMER") throw errors.forbidden("Оформить безопасную сделку может только заказчик перевозки.");
  const settings = await getSettings();
  if (!settings.secureDealEnabled) throw errors.forbidden("Безопасная сделка отключена администратором платформы.");
  if (!SECURE_DEAL_INITIATE_STATUSES.includes(order.currentStatus)) {
    throw new AppError("INVALID_STATE_TRANSITION", "Безопасную сделку можно оформить только до начала загрузки.");
  }
  const provider = getPaymentProvider();
  let payment: PaymentRow;
  try {
    payment = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, orderId);
      if (await findLiveSecureDeal(tx, orderId)) throw new AppError("DUPLICATE_ACTION", "Безопасная сделка по перевозке уже оформлена.");
      const ledger = await tx.paymentRecord.count({ where: { orderId, type: { not: "SECURE_DEAL" }, status: { not: "CANCELLED" } } });
      if (ledger > 0) {
        throw new AppError(
          "CONFLICT",
          "По перевозке уже ведётся ручной учёт платежей. Отмените записи о платежах, чтобы перейти на безопасную сделку.",
        );
      }
      const fresh = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
      const amount = n(fresh.agreedAmount);
      const rule = commissionRuleFor(settings, fresh.currency);
      const { fee } = computeCommission(amount, rule);
      const created = await tx.paymentRecord.create({
        data: {
          orderId,
          payerCompanyId: fresh.shipperCompanyId,
          payeeCompanyId: fresh.carrierCompanyId,
          amount,
          currency: fresh.currency,
          type: "SECURE_DEAL",
          status: "PAYMENT_PENDING",
          platformFee: fee,
          feePercent: rule.percent,
          feeFixed: rule.fixed,
          provider: provider.code,
          createdByUserId: actor.userId,
          note: "Безопасная сделка",
          metadata: { providerTestMode: provider.testMode, confirmationWindowHours: settings.confirmationWindowHours },
        },
      });
      await tx.paymentStatusHistory.create({
        data: {
          paymentId: created.id,
          fromStatus: null,
          toStatus: "PAYMENT_PENDING",
          actorUserId: actor.userId,
          actorType: "USER",
          reason: "Заказчик оформил безопасную сделку",
        },
      });
      await audit(
        actor,
        {
          action: AuditAction.SECURE_DEAL_CREATED,
          entityType: "TransportOrder",
          entityId: orderId,
          companyId: access.membership?.companyId ?? null,
          newValue: { paymentId: created.id, amount, currency: fresh.currency, platformFee: fee, provider: provider.code },
        },
        tx,
      );
      await notifyParties(
        tx,
        orderId,
        "оформлена безопасная сделка",
        `${formatMoney(amount, fresh.currency)}. Выплата перевозчику — после доставки и подтверждения получения.`,
        { exclude: actor.userId },
      );
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE_ACTION", "Безопасная сделка по перевозке уже оформлена.");
    }
    throw e;
  }
  await requestOperation({
    paymentId: payment.id,
    kind: provider.twoStepReserve ? "AUTHORIZE" : "RESERVE",
    by: "PAYER",
    actor,
    reason: "Обеспечение оплаты по безопасной сделке",
  });
  return prisma.paymentRecord.findUniqueOrThrow({ where: { id: payment.id } });
}

/** Заказчик отменяет безопасную сделку, пока оплата не обеспечена. */
export async function cancelSecureDeal(actor: Actor, orderId: string) {
  const { access } = await requireOrderAccess(actor, orderId, "SECURE_DEAL_INITIATE");
  if (access.side !== "CUSTOMER") throw errors.forbidden("Отменить безопасную сделку может только заказчик.");
  const payment = await findLiveSecureDeal(prisma, orderId);
  if (!payment) throw errors.notFound("Безопасная сделка не найдена.");
  return cancelUnsecured(payment.id, "PAYER", actor, "Заказчик отменил безопасную сделку");
}

async function cancelUnsecured(paymentId: string, by: PaymentActor, actor: Actor | null, reason: string) {
  const p0 = await prisma.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
  if (p0.status === "PAYMENT_AUTHORIZED") {
    return requestOperation({ paymentId, kind: "VOID", by, actor, reason });
  }
  return prisma.$transaction(async (tx) => {
    const p = await lockPayment(tx, paymentId);
    if (p.status !== "PAYMENT_PENDING") {
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        "Оплата уже обеспечена — вернуть средства можно только через спор или администратора.",
      );
    }
    await tx.paymentTransaction.updateMany({
      where: { paymentId, status: "PENDING" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    const updated = await transitionPayment(tx, p, "PAYMENT_CANCELLED", by, { actor, reason, data: { cancelledAt: new Date() } });
    await audit(
      actor,
      { action: AuditAction.SECURE_DEAL_CANCELLED, entityType: "TransportOrder", entityId: p.orderId, newValue: { paymentId, reason } },
      tx,
    );
    await notifyParties(tx, p.orderId, "безопасная сделка отменена", reason, { exclude: actor?.userId });
    return updated;
  });
}

/**
 * Условия выплаты выполнены (получение подтверждено, документы есть, спора нет) → запрос выплаты у провайдера.
 * Возвращает null, если условия не выполнены.
 */
export async function releaseIfConditionsMet(orderId: string, actor: Actor | null, reason: string) {
  const [order, payment, settings] = await Promise.all([
    prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } }),
    findLiveSecureDeal(prisma, orderId),
    getSettings(),
  ]);
  if (!payment || !HELD_STATUSES.includes(payment.status as SecureDealStatus)) return null;
  if (payment.status === "PAYMENT_DISPUTED") return null;
  const [podCount, openDisputes] = await Promise.all([
    prisma.orderDocument.count({ where: { orderId, status: "ACTIVE", type: { in: ["PROOF_OF_DELIVERY", "CMR"] } } }),
    prisma.dispute.count({ where: { orderId, status: { in: ["OPEN", "IN_REVIEW"] } } }),
  ]);
  const { ready } = releaseConditions({
    paymentStatus: payment.status as SecureDealStatus,
    orderStatus: order.currentStatus,
    deliveredAt: order.deliveredAt,
    podCount,
    requirePod: settings.requirePodForClose,
    receiptConfirmedAt: order.receiptConfirmedAt,
    receiptAutoConfirmed: order.receiptAutoConfirmed,
    confirmationDueAt: order.confirmationDueAt,
    hasOpenDispute: openDisputes > 0,
  });
  if (!ready) return null;
  return requestOperation({ paymentId: payment.id, kind: "RELEASE", by: "SYSTEM", actor, reason });
}

/**
 * Подтверждение получения при безопасной сделке: фиксируется факт подтверждения, затем запрашивается выплата.
 * Перевозка закрывается после подтверждения выплаты провайдером (см. applyProviderResult).
 */
export async function confirmReceiptWithSecureDeal(actor: Actor, orderId: string, comment: string | null) {
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.receiptConfirmedAt) throw new AppError("DUPLICATE_ACTION", "Получение уже подтверждено. Выплата перевозчику обрабатывается.");
    if (order.currentStatus !== "DELIVERED") {
      throw new AppError("DELIVERY_NOT_ALLOWED", "Подтвердить получение можно после того, как перевозчик отметит доставку.");
    }
    await tx.transportOrder.update({ where: { id: orderId }, data: { receiptConfirmedAt: new Date() } });
    await tx.trackingEvent.create({
      data: { orderId, userId: actor.userId, type: "DELIVERED", source: "WEB", note: "Получение подтверждено заказчиком" },
    });
    await audit(
      actor,
      { action: AuditAction.DELIVERY_CONFIRMED, entityType: "TransportOrder", entityId: orderId, newValue: { comment, secureDeal: true } },
      tx,
    );
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, order),
      excludeUserId: actor.userId,
      type: "DELIVERY_CONFIRMED",
      title: `${order.publicNumber}: получение подтверждено`,
      body: "Условия безопасной сделки выполнены — выплата перевозчику передана платёжному провайдеру.",
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}?tab=finance`,
    });
  });
  await releaseIfConditionsMet(orderId, actor, comment ?? "Заказчик подтвердил получение груза");
  return prisma.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
}

/** Срок проверки для уже доставленной перевозки, у которой он ещё не выставлен (или истёк до резерва). */
async function ensureConfirmationWindow(tx: Tx, orderId: string, from: Date) {
  const order = await tx.transportOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { currentStatus: true, confirmationDueAt: true, receiptConfirmedAt: true },
  });
  if (order.currentStatus !== "DELIVERED" || order.receiptConfirmedAt) return null;
  if (order.confirmationDueAt && order.confirmationDueAt > from) return order.confirmationDueAt;
  const settings = await getSettings(tx);
  const due = new Date(from.getTime() + settings.confirmationWindowHours * 60 * 60_000);
  await tx.transportOrder.update({ where: { id: orderId }, data: { confirmationDueAt: due } });
  return due;
}

/** Вызывается при отметке доставки: запускает период проверки. */
export async function startConfirmationWindow(tx: Tx, orderId: string, deliveredAt: Date) {
  const payment = await findLiveSecureDeal(tx, orderId);
  if (!payment || !HELD_STATUSES.includes(payment.status as SecureDealStatus)) return null;
  const settings = await getSettings(tx);
  const due = new Date(deliveredAt.getTime() + settings.confirmationWindowHours * 60 * 60_000);
  await tx.transportOrder.update({ where: { id: orderId }, data: { confirmationDueAt: due } });
  return due;
}

/** Открытие спора замораживает обеспеченную оплату. */
export async function freezeForDispute(tx: Tx, orderId: string, disputeId: string, actor: Actor) {
  const payment = await findLiveSecureDeal(tx, orderId);
  if (!payment) return null;
  const p = await lockPayment(tx, payment.id);
  if (p.status !== "PAYMENT_RESERVED" && p.status !== "PAYMENT_PARTIALLY_RELEASED") {
    if (p.status === "PAYMENT_RELEASE_PENDING") {
      // Выплата уже передана провайдеру по подтверждению заказчика — отозвать её спор не может
      await tx.paymentRecord.update({ where: { id: p.id }, data: { disputeId } });
    }
    return p;
  }
  return transitionPayment(tx, p, "PAYMENT_DISPUTED", "SYSTEM", {
    actor,
    reason: "Открыт спор — выплата заморожена",
    data: { dispute: { connect: { id: disputeId } } },
  });
}

export type DisputePaymentOutcome = "KEEP" | "RELEASE_FULL" | "REFUND_FULL" | "SPLIT";

/** Проверка решения по деньгам до закрытия спора. */
export async function validateDisputePaymentOutcome(
  orderId: string,
  orderOutcome: "RESUME" | "CANCEL" | "CLOSE",
  outcome: DisputePaymentOutcome | undefined,
  releaseAmount: number | null | undefined,
) {
  const payment = await findLiveSecureDeal(prisma, orderId);
  if (!payment || !["PAYMENT_DISPUTED", "PAYMENT_PARTIALLY_RELEASED", "PAYMENT_RESERVED"].includes(payment.status)) {
    return { payment, outcome: "KEEP" as DisputePaymentOutcome };
  }
  const resolved: DisputePaymentOutcome =
    outcome ?? (orderOutcome === "RESUME" ? "KEEP" : orderOutcome === "CLOSE" ? "RELEASE_FULL" : "REFUND_FULL");
  if (orderOutcome === "RESUME" && resolved !== "KEEP") {
    throw errors.validation("При возобновлении перевозки средства остаются в резерве.", {
      paymentOutcome: ["Выберите «Оставить в резерве»"],
    });
  }
  if (orderOutcome !== "RESUME" && resolved === "KEEP") {
    throw errors.validation("Укажите, как распределить удерживаемую сумму.", { paymentOutcome: ["Выберите решение по оплате"] });
  }
  if (orderOutcome === "CLOSE" && resolved === "REFUND_FULL") {
    throw errors.validation("При закрытии перевозки выберите выплату перевозчику или частичную выплату.", {
      paymentOutcome: ["Недопустимое сочетание"],
    });
  }
  if (orderOutcome === "CANCEL" && resolved === "RELEASE_FULL") {
    throw errors.validation("При отмене перевозки выберите возврат заказчику или частичную выплату.", {
      paymentOutcome: ["Недопустимое сочетание"],
    });
  }
  if (resolved === "SPLIT") {
    const held = heldAmount(payment);
    if (releaseAmount == null || !(toMinor(releaseAmount) > 0) || toMinor(releaseAmount) >= toMinor(held)) {
      throw errors.validation(
        `Сумма выплаты перевозчику должна быть больше 0 и меньше удерживаемой суммы (${formatMoney(held, payment.currency)}).`,
        {
          releaseAmount: ["Некорректная сумма"],
        },
      );
    }
  }
  return { payment, outcome: resolved };
}

/** Внутри транзакции закрытия спора: возврат замороженной оплаты в резерв (перевозка возобновляется). */
export async function unfreezeInTx(tx: Tx, paymentId: string, actor: Actor, reason: string) {
  const p = await lockPayment(tx, paymentId);
  if (p.status !== "PAYMENT_DISPUTED") return p;
  const updated = await transitionPayment(tx, p, "PAYMENT_RESERVED", "ADMIN", { actor, reason });
  // После спора по доставленной перевозке у заказчика снова есть полный срок проверки
  await tx.transportOrder.updateMany({
    where: { id: p.orderId, currentStatus: "DELIVERED", receiptConfirmedAt: null },
    data: { confirmationDueAt: null },
  });
  await ensureConfirmationWindow(tx, p.orderId, new Date());
  return updated;
}

/** После фиксации решения по спору — операции у провайдера. */
export async function executeDisputeOutcome(
  actor: Actor,
  paymentId: string,
  outcome: DisputePaymentOutcome,
  releaseAmount: number | null | undefined,
  reason: string,
) {
  if (outcome === "KEEP") return;
  if (outcome === "RELEASE_FULL") {
    await requestOperation({ paymentId, kind: "RELEASE", by: "ADMIN", actor, reason });
    return;
  }
  if (outcome === "REFUND_FULL") {
    await requestOperation({ paymentId, kind: "REFUND", by: "ADMIN", actor, reason });
    return;
  }
  // SPLIT: часть — перевозчику, остаток — заказчику
  const after = await requestOperation({ paymentId, kind: "RELEASE", amount: releaseAmount!, by: "ADMIN", actor, reason });
  const pending = await prisma.paymentTransaction.count({ where: { paymentId, status: "PENDING" } });
  if (pending === 0 && heldAmount(after) > 0) {
    await requestOperation({ paymentId, kind: "REFUND", by: "ADMIN", actor, reason: `${reason} (возврат остатка)` });
  }
}

/** Отмена перевозки: неподтверждённая оплата отменяется, обеспеченная — возвращается заказчику. */
export async function settleOnOrderCancel(orderId: string, actor: Actor | null, reason: string) {
  const payment = await findLiveSecureDeal(prisma, orderId);
  if (!payment) return null;
  const status = payment.status as SecureDealStatus;
  if (UNSECURED_STATUSES.includes(status)) return cancelUnsecured(payment.id, "SYSTEM", actor, `Перевозка отменена: ${reason}`);
  if (HELD_STATUSES.includes(status) && status !== "PAYMENT_RELEASE_PENDING") {
    return requestOperation({ paymentId: payment.id, kind: "REFUND", by: "SYSTEM", actor, reason: `Перевозка отменена: ${reason}` });
  }
  return payment;
}

/**
 * Системная задача: истёк срок проверки после доставки, спор не открыт → получение подтверждается автоматически
 * (если это разрешено настройками) и запрашивается выплата. Запускается по расписанию (cron) или администратором.
 */
export async function processConfirmationTimeouts(now = new Date(), actor: Actor | null = null) {
  const settings = await getSettings();
  const heldDeal = {
    some: { type: "SECURE_DEAL" as const, status: { in: ["PAYMENT_RESERVED" as const, "PAYMENT_PARTIALLY_RELEASED" as const] } },
  };
  const due = await prisma.transportOrder.findMany({
    where: {
      currentStatus: "DELIVERED",
      receiptConfirmedAt: null,
      confirmationDueAt: { lte: now },
      payments: heldDeal,
    },
    select: { id: true, publicNumber: true },
    // Самые старые сроки — первыми, чтобы пропущенные заказы не вытесняли остальные
    orderBy: { confirmationDueAt: "asc" },
    take: 200,
  });
  // Получение уже подтверждено, но выплата не запрошена (не было документов, операция провайдера не прошла)
  const pendingRelease = await prisma.transportOrder.findMany({
    where: {
      currentStatus: "DELIVERED",
      receiptConfirmedAt: { not: null },
      payments: { some: { ...heldDeal.some, transactions: { none: { status: "PENDING" } } } },
    },
    select: { id: true, publicNumber: true },
    orderBy: { receiptConfirmedAt: "asc" },
    take: 200,
  });
  const result = {
    checked: due.length + pendingRelease.length,
    confirmed: 0,
    released: 0,
    skipped: [] as { order: string; reason: string }[],
  };
  if (!settings.autoConfirmOnTimeout) {
    result.skipped.push(...due.map((o) => ({ order: o.publicNumber, reason: "Автоподтверждение отключено в настройках" })));
  }
  for (const o of settings.autoConfirmOnTimeout ? due : []) {
    if (settings.requirePodForClose) {
      const pod = await prisma.orderDocument.count({
        where: { orderId: o.id, status: "ACTIVE", type: { in: ["PROOF_OF_DELIVERY", "CMR"] } },
      });
      if (pod === 0) {
        result.skipped.push({ order: o.publicNumber, reason: "Нет подтверждающих документов (POD/CMR)" });
        continue;
      }
    }
    const confirmed = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, o.id);
      const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: o.id } });
      if (order.currentStatus !== "DELIVERED" || order.receiptConfirmedAt || !order.confirmationDueAt || order.confirmationDueAt > now) {
        return false;
      }
      await tx.transportOrder.update({ where: { id: o.id }, data: { receiptConfirmedAt: now, receiptAutoConfirmed: true } });
      await audit(
        actor,
        {
          action: AuditAction.DELIVERY_AUTO_CONFIRMED,
          entityType: "TransportOrder",
          entityId: o.id,
          companyId: null,
          newValue: { confirmationDueAt: order.confirmationDueAt, windowHours: settings.confirmationWindowHours },
        },
        tx,
      );
      await notify(tx, {
        userIds: await orderParticipantUserIds(tx, order, { customer: true, carrier: true }),
        type: "DELIVERY_CONFIRMED",
        title: `${order.publicNumber}: срок проверки истёк`,
        body: "Спор не открыт — получение подтверждено автоматически, выплата перевозчику передана провайдеру.",
        entityType: "TransportOrder",
        entityId: o.id,
        link: `/orders/${o.id}?tab=finance`,
      });
      return true;
    });
    if (!confirmed) continue;
    result.confirmed += 1;
    try {
      const p = await releaseIfConditionsMet(o.id, actor, "Срок проверки истёк без спора — автоматическая выплата");
      if (p) result.released += 1;
    } catch (e) {
      logger.error("secure-deal.auto-release.failed", { orderId: o.id, error: e });
      result.skipped.push({ order: o.publicNumber, reason: e instanceof AppError ? e.message : "Ошибка запроса выплаты" });
    }
  }
  for (const o of pendingRelease) {
    try {
      const p = await releaseIfConditionsMet(o.id, actor, "Повторный запрос выплаты: получение подтверждено, условия выполнены");
      if (p) result.released += 1;
      else result.skipped.push({ order: o.publicNumber, reason: "Условия выплаты не выполнены (документы / спор)" });
    } catch (e) {
      logger.error("secure-deal.retry-release.failed", { orderId: o.id, error: e });
      result.skipped.push({ order: o.publicNumber, reason: e instanceof AppError ? e.message : "Ошибка запроса выплаты" });
    }
  }
  return result;
}

// ─────────── Администратор ───────────

function requireAdminPayments(actor: Actor) {
  if (!actor.isAdmin || !actor.permissions.has("ADMIN_PAYMENTS")) {
    throw errors.forbidden("Операции с безопасной сделкой выполняет только администратор платформы.");
  }
}

export async function adminRelease(actor: Actor, paymentId: string, input: { amount?: number | null; reason: string }) {
  requireAdminPayments(actor);
  return requestOperation({ paymentId, kind: "RELEASE", amount: input.amount ?? undefined, by: "ADMIN", actor, reason: input.reason });
}

export async function adminRefund(actor: Actor, paymentId: string, input: { amount?: number | null; reason: string }) {
  requireAdminPayments(actor);
  return requestOperation({ paymentId, kind: "REFUND", amount: input.amount ?? undefined, by: "ADMIN", actor, reason: input.reason });
}

/** Ручное подтверждение операции по данным банка-партнёра (только для провайдера с ручным подтверждением). */
export async function adminConfirmTransaction(
  actor: Actor,
  transactionId: string,
  input: { outcome: "SUCCEEDED" | "FAILED"; providerTransactionId: string | null; failureReason: string | null },
) {
  requireAdminPayments(actor);
  const t = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!t) throw errors.notFound("Операция не найдена.");
  const provider = providerByCode(t.provider);
  if (!provider?.manualConfirmation) {
    throw errors.forbidden("Операции этого провайдера подтверждаются только самим провайдером (webhook).");
  }
  if (t.status !== "PENDING") throw new AppError("DUPLICATE_ACTION", "Операция уже завершена.");
  if (input.outcome === "SUCCEEDED" && !input.providerTransactionId) {
    throw errors.validation("Укажите номер операции в банке (платёжное поручение, выписка).", {
      providerTransactionId: ["Обязательно"],
    });
  }
  const result: ProviderResult =
    input.outcome === "SUCCEEDED"
      ? { status: "SUCCEEDED", providerTransactionId: input.providerTransactionId! }
      : { status: "FAILED", providerTransactionId: input.providerTransactionId, failureReason: input.failureReason ?? "Отклонено банком" };
  await applyProviderResult(transactionId, result, { actor, manual: true });
  await continueFlow(t.paymentId, actor);
  return prisma.paymentRecord.findUniqueOrThrow({ where: { id: t.paymentId } });
}

/** Повторная отправка незавершённой операции провайдеру с тем же ключом идемпотентности. */
export async function adminRetryTransaction(actor: Actor, transactionId: string) {
  requireAdminPayments(actor);
  const t = await prisma.paymentTransaction.findUnique({ where: { id: transactionId }, include: { payment: true } });
  if (!t) throw errors.notFound("Операция не найдена.");
  if (t.status !== "PENDING") throw new AppError("DUPLICATE_ACTION", "Операция уже завершена.");
  const provider = providerByCode(t.provider);
  if (!provider) throw new AppError("CONFLICT", "Провайдер операции не настроен.");
  const order = await prisma.transportOrder.findUniqueOrThrow({ where: { id: t.payment.orderId }, select: { publicNumber: true } });
  await dispatchToProvider(
    t.id,
    provider,
    {
      kind: t.kind,
      idempotencyKey: t.idempotencyKey,
      paymentId: t.paymentId,
      orderNumber: order.publicNumber,
      amount: n(t.amount),
      fee: n(t.fee),
      currency: t.currency,
      payerCompanyId: t.payment.payerCompanyId,
      payeeCompanyId: t.payment.payeeCompanyId,
      reference: t.payment.providerTransactionId,
    },
    actor,
  );
  return prisma.paymentRecord.findUniqueOrThrow({ where: { id: t.paymentId } });
}

/** Webhook провайдера: результат операции по нашему ключу идемпотентности. */
export async function handleProviderWebhook(
  providerCode: string,
  body: {
    idempotencyKey: string;
    status: "SUCCEEDED" | "FAILED" | "PENDING";
    providerTransactionId?: string | null;
    failureReason?: string | null;
  },
) {
  const t = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
  if (!t || t.provider !== providerCode) throw errors.notFound("Операция не найдена.");
  const result: ProviderResult =
    body.status === "SUCCEEDED"
      ? { status: "SUCCEEDED", providerTransactionId: body.providerTransactionId ?? t.idempotencyKey }
      : body.status === "FAILED"
        ? {
            status: "FAILED",
            providerTransactionId: body.providerTransactionId ?? null,
            failureReason: body.failureReason ?? "Отклонено провайдером",
          }
        : { status: "PENDING", providerTransactionId: body.providerTransactionId ?? null };
  const r = await applyProviderResult(t.id, result, { actor: null });
  await continueFlow(t.paymentId, null);
  return { processed: !r.alreadyProcessed };
}

export async function listSecureDeals(actor: Actor, opts: { page: number; pageSize: number; status?: string }) {
  requireAdminPayments(actor);
  const where: Prisma.PaymentRecordWhereInput = {
    type: "SECURE_DEAL",
    ...(opts.status ? { status: opts.status as SecureDealStatus } : {}),
  };
  const [items, total, pending] = await Promise.all([
    prisma.paymentRecord.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        order: { select: { id: true, publicNumber: true, currentStatus: true } },
        payer: { select: { legalName: true } },
        payee: { select: { legalName: true } },
        transactions: { where: { status: "PENDING" }, select: { id: true, kind: true, amount: true, provider: true } },
      },
    }),
    prisma.paymentRecord.count({ where }),
    prisma.paymentTransaction.count({ where: { status: "PENDING" } }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize, pendingOperations: pending };
}

// ─────────── Просмотр ───────────

/** Безопасная сделка по перевозке: платёж, условия выплаты, операции, история. */
export async function getSecureDealView(actor: Actor, orderId: string) {
  const { access, order } = await requireOrderAccess(actor, orderId, "PAYMENT_VIEW");
  const [settings, full, podCount, openDisputes] = await Promise.all([
    getSettings(),
    prisma.transportOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { deliveredAt: true, receiptConfirmedAt: true, receiptAutoConfirmed: true, confirmationDueAt: true, currentStatus: true },
    }),
    prisma.orderDocument.count({ where: { orderId, status: "ACTIVE", type: { in: ["PROOF_OF_DELIVERY", "CMR"] } } }),
    prisma.dispute.count({ where: { orderId, status: { in: ["OPEN", "IN_REVIEW"] } } }),
  ]);
  const payment =
    (await findLiveSecureDeal(prisma, orderId)) ??
    (await prisma.paymentRecord.findFirst({ where: { orderId, type: "SECURE_DEAL" }, orderBy: { createdAt: "desc" } }));
  const provider = payment ? providerFor(payment) : getPaymentProvider();
  const rule = commissionRuleFor(settings, order.currency);
  const preview = computeCommission(n(order.agreedAmount), rule);
  const ledgerCount = await prisma.paymentRecord.count({
    where: { orderId, type: { not: "SECURE_DEAL" }, status: { not: "CANCELLED" } },
  });
  const live = payment && LIVE_STATUSES.includes(payment.status as SecureDealStatus);
  const canInitiate =
    access.side === "CUSTOMER" &&
    access.can("SECURE_DEAL_INITIATE") &&
    settings.secureDealEnabled &&
    !live &&
    ledgerCount === 0 &&
    SECURE_DEAL_INITIATE_STATUSES.includes(order.currentStatus);

  let details = null;
  if (payment) {
    const [transactions, history] = await Promise.all([
      prisma.paymentTransaction.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } }),
      prisma.paymentStatusHistory.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } }),
    ]);
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(history.map((h) => h.actorUserId).filter(Boolean) as string[])] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const conditions = releaseConditions({
      paymentStatus: payment.status as SecureDealStatus,
      orderStatus: full.currentStatus,
      deliveredAt: full.deliveredAt,
      podCount,
      requirePod: settings.requirePodForClose,
      receiptConfirmedAt: full.receiptConfirmedAt,
      receiptAutoConfirmed: full.receiptAutoConfirmed,
      confirmationDueAt: full.confirmationDueAt,
      hasOpenDispute: openDisputes > 0,
    });
    const held = heldAmount(payment);
    details = {
      payment: toPlain(payment),
      held,
      payout: fromMinor(toMinor(n(payment.amount)) - toMinor(n(payment.platformFee))),
      transactions: toPlain(transactions),
      history: toPlain(history),
      userNames: Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`])),
      conditions: conditions.conditions,
      ready: conditions.ready,
      canCancel: access.side === "CUSTOMER" && UNSECURED_STATUSES.includes(payment.status as SecureDealStatus),
      hasPendingOperation: transactions.some((t) => t.status === "PENDING"),
    };
  }
  return {
    ...details,
    payment: details?.payment ?? null,
    order: {
      status: full.currentStatus,
      deliveredAt: full.deliveredAt,
      receiptConfirmedAt: full.receiptConfirmedAt,
      receiptAutoConfirmed: full.receiptAutoConfirmed,
      confirmationDueAt: full.confirmationDueAt,
      amount: n(order.agreedAmount),
      currency: order.currency,
    },
    provider: { code: provider.code, title: provider.title, testMode: provider.testMode, manualConfirmation: provider.manualConfirmation },
    settings: {
      enabled: settings.secureDealEnabled,
      required: settings.requireSecureDeal,
      confirmationWindowHours: settings.confirmationWindowHours,
      autoConfirmOnTimeout: settings.autoConfirmOnTimeout,
      requirePod: settings.requirePodForClose,
    },
    feePreview: { fee: preview.fee, payout: preview.payout, percent: rule.percent, fixed: rule.fixed },
    canInitiate,
    ledgerBlocks: ledgerCount > 0,
    side: access.side,
  };
}

export type SecureDealView = Awaited<ReturnType<typeof getSecureDealView>>;
