import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { FuelTransactionSource, FuelTransactionStatus, FuelType } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { checkFuelPurchase, periodStarts, type LimitViolation } from "@/lib/fuel/limits";
import { fuelCardProviderByCode } from "@/lib/fuel/providers";
import { canFuelTxTransition, FUEL_TX_COUNTED } from "@/lib/fuel/transaction-state-machine";
import { logger } from "@/lib/logger";
import { fromMinor, toMinor } from "@/lib/money";
import type { driverFuelPurchaseSchema, fuelListQuerySchema, fuelPurchaseSchema } from "@/lib/validation/fuel";
import { analyzeTransaction } from "./fuel-analysis.service";
import { cardLimits, lockAccount, postAccountEntry } from "./fuel-card.service";
import { canSeeFuelMoney, driverProfileFor, fuelScope, hideFuelMoney } from "./fuel-access";

/**
 * Топливные транзакции.
 *
 * Поток: авторизация (лимиты карты и доступный баланс проверяются на сервере, сумма резервируется)
 *   → завершение (резерв снимается, списывается фактическая сумма) → анализ (GPS, уровень, бак, частота, маршрут).
 * Идемпотентность: (provider, providerTransactionId) уникальны — повторное сообщение провайдера возвращает ту же транзакцию
 * и не приводит к повторному резерву или списанию. Завершённая транзакция меняется только возвратом или спором.
 */

export type PurchaseInput = {
  card: { id: string } | { provider: string; providerCardId: string };
  provider: string;
  providerTransactionId: string;
  source: FuelTransactionSource;
  stationName: string;
  stationBrand?: string | null;
  stationId?: string | null;
  stationAddress?: string | null;
  stationCountry?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  fuelType: FuelType;
  liters: number;
  pricePerLiter: number;
  transactionDate: Date;
  isDemo?: boolean;
  metadata?: Record<string, unknown>;
};

export type AuthorizationResult = {
  transaction: Prisma.FuelTransactionGetPayload<object>;
  approved: boolean;
  violations: LimitViolation[];
  replay: boolean;
};

async function lockCard(tx: Tx, cardId: string) {
  await tx.$queryRaw`SELECT id FROM "FuelCard" WHERE id = ${cardId}::uuid FOR UPDATE`;
}

/** Рейс, во время которого сделана заправка: автомобиль передан водителю и груз ещё не доставлен. */
export async function tripForRefuel(db: Tx, vehicleId: string | null, at: Date) {
  if (!vehicleId) return null;
  const order = await db.transportOrder.findFirst({
    where: {
      vehicleId,
      currentStatus: { notIn: ["CANCELLED"] },
      statusHistory: { some: { toStatus: "WAITING_FOR_LOADING", createdAt: { lte: at } } },
      OR: [{ deliveredAt: null }, { deliveredAt: { gte: at } }],
    },
    orderBy: { statusChangedAt: "desc" },
    select: { id: true },
  });
  return order?.id ?? null;
}

async function cardUsage(tx: Tx, card: { id: string; timezone: string }, at: Date) {
  const { dayStart, monthStart } = periodStarts(at, card.timezone);
  // Последовательно: запросы внутри транзакции идут по одному соединению, параллельные запросы на нём недопустимы
  const day = await tx.fuelTransaction.aggregate({
    where: { fuelCardId: card.id, status: { in: FUEL_TX_COUNTED }, transactionDate: { gte: dayStart } },
    _sum: { liters: true, totalAmount: true },
  });
  const month = await tx.fuelTransaction.aggregate({
    where: { fuelCardId: card.id, status: { in: FUEL_TX_COUNTED }, transactionDate: { gte: monthStart } },
    _sum: { liters: true, totalAmount: true },
  });
  return {
    dayLiters: Number(day._sum.liters ?? 0),
    monthLiters: Number(month._sum.liters ?? 0),
    dayAmount: Number(day._sum.totalAmount ?? 0),
    monthAmount: Number(month._sum.totalAmount ?? 0),
  };
}

/** Авторизация заправки: проверка карты и лимитов, резерв суммы. DECLINED тоже сохраняется (для истории и анализа). */
export async function authorizePurchase(input: PurchaseInput, actor: Actor | null = null): Promise<AuthorizationResult> {
  const card = await prisma.fuelCard.findFirst({
    where: "id" in input.card ? { id: input.card.id } : { provider: input.card.provider, providerCardId: input.card.providerCardId },
  });
  if (!card) throw errors.notFound("Топливная карта не найдена.");
  const amount = fromMinor(Math.round(input.liters * toMinor(input.pricePerLiter)));
  try {
    return await prisma.$transaction(async (tx) => {
      await lockCard(tx, card.id);
      const account = await lockAccount(tx, card.fuelAccountId);
      const existing = await tx.fuelTransaction.findUnique({
        where: { provider_providerTransactionId: { provider: input.provider, providerTransactionId: input.providerTransactionId } },
      });
      if (existing) return { transaction: existing, approved: existing.status !== "DECLINED", violations: [], replay: true };

      const fresh = await tx.fuelCard.findUniqueOrThrow({ where: { id: card.id } });
      const usage = await cardUsage(tx, fresh, input.transactionDate);
      const available = fromMinor(toMinor(Number(account.balance)) - toMinor(Number(account.reserved)));
      const check = checkFuelPurchase(
        { status: fresh.status, expiresAt: fresh.expiresAt },
        cardLimits(fresh),
        {
          liters: input.liters,
          amount,
          fuelType: input.fuelType,
          stationBrand: input.stationBrand,
          stationId: input.stationId,
          stationCountry: input.stationCountry,
          at: input.transactionDate,
        },
        usage,
        { available },
      );
      const orderId = await tripForRefuel(tx, fresh.vehicleId, input.transactionDate);
      const t = await tx.fuelTransaction.create({
        data: {
          companyId: fresh.companyId,
          fuelAccountId: account.id,
          fuelCardId: fresh.id,
          vehicleId: fresh.vehicleId,
          driverId: fresh.driverId,
          orderId,
          provider: input.provider,
          providerTransactionId: input.providerTransactionId,
          stationName: input.stationName,
          stationBrand: input.stationBrand ?? null,
          stationId: input.stationId ?? null,
          stationAddress: input.stationAddress ?? null,
          stationCountry: input.stationCountry ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          fuelType: input.fuelType,
          liters: input.liters,
          pricePerLiter: input.pricePerLiter,
          totalAmount: amount,
          authorizedAmount: check.allowed ? amount : 0,
          currency: account.currency,
          transactionDate: input.transactionDate,
          status: check.allowed ? "AUTHORIZED" : "DECLINED",
          source: input.source,
          declineReason: check.allowed ? null : check.violations.map((v) => v.message).join(" "),
          isDemo: input.isDemo ?? fresh.isDemo,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          matchStatus: check.allowed ? "PENDING" : "UNVERIFIED",
        },
      });
      if (check.allowed) {
        await postAccountEntry(tx, {
          accountId: account.id,
          type: "RESERVE",
          amount,
          idempotencyKey: `fuel:${t.id}:reserve`,
          fuelTransactionId: t.id,
          userId: actor?.userId,
        });
      }
      await audit(
        actor,
        {
          action: check.allowed ? AuditAction.FUEL_TX_AUTHORIZED : AuditAction.FUEL_TX_DECLINED,
          entityType: "FuelTransaction",
          entityId: t.id,
          companyId: fresh.companyId,
          newValue: {
            liters: input.liters,
            amount,
            currency: account.currency,
            card: fresh.label,
            violations: check.violations.map((v) => v.code),
          },
        },
        tx,
      );
      return { transaction: t, approved: check.allowed, violations: check.violations, replay: false };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Параллельный дубликат с тем же ID провайдера
      const t = await prisma.fuelTransaction.findUniqueOrThrow({
        where: { provider_providerTransactionId: { provider: input.provider, providerTransactionId: input.providerTransactionId } },
      });
      return { transaction: t, approved: t.status !== "DECLINED", violations: [], replay: true };
    }
    throw e;
  }
}

async function transition(tx: Tx, t: { id: string; status: FuelTransactionStatus }, to: FuelTransactionStatus) {
  const check = canFuelTxTransition(t.status, to);
  if (!check.ok) throw new AppError(t.status === to ? "DUPLICATE_ACTION" : "INVALID_STATE_TRANSITION", check.reason);
  // Оптимистичная защита: статус меняется, только если не изменился параллельно
  const res = await tx.fuelTransaction.updateMany({ where: { id: t.id, status: t.status }, data: { status: to } });
  if (res.count !== 1) throw new AppError("CONFLICT", "Транзакция уже изменена другой операцией.");
}

async function lockTx(tx: Tx, transactionId: string) {
  const head = await tx.fuelTransaction.findUnique({ where: { id: transactionId }, select: { fuelAccountId: true } });
  if (!head) throw errors.notFound("Заправка не найдена.");
  await lockAccount(tx, head.fuelAccountId);
  return tx.fuelTransaction.findUniqueOrThrow({ where: { id: transactionId } });
}

/** Завершение: снимается резерв, списывается фактическая сумма (не больше авторизованной). Затем — анализ. */
export async function completeTransaction(
  transactionId: string,
  final: { liters?: number; pricePerLiter?: number; totalAmount?: number | null } = {},
  actor: Actor | null = null,
) {
  const done = await prisma.$transaction(async (tx) => {
    const t = await lockTx(tx, transactionId);
    if (t.status === "COMPLETED") return { t, replay: true };
    const liters = final.liters ?? Number(t.liters);
    const price = final.pricePerLiter ?? Number(t.pricePerLiter);
    const total = final.totalAmount ?? fromMinor(Math.round(liters * toMinor(price)));
    if (toMinor(total) > toMinor(Number(t.authorizedAmount))) {
      throw errors.validation("Сумма расчёта превышает авторизованную сумму — требуется новая авторизация.");
    }
    await transition(tx, t, "COMPLETED");
    await tx.fuelTransaction.update({ where: { id: t.id }, data: { liters, pricePerLiter: price, totalAmount: total } });
    await postAccountEntry(tx, {
      accountId: t.fuelAccountId,
      type: "RELEASE",
      amount: Number(t.authorizedAmount),
      idempotencyKey: `fuel:${t.id}:release`,
      fuelTransactionId: t.id,
      userId: actor?.userId,
    });
    await postAccountEntry(tx, {
      accountId: t.fuelAccountId,
      type: "CHARGE",
      amount: total,
      idempotencyKey: `fuel:${t.id}:charge`,
      fuelTransactionId: t.id,
      note: `${t.stationName}: ${liters} л`,
      userId: actor?.userId,
    });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_TX_COMPLETED,
        entityType: "FuelTransaction",
        entityId: t.id,
        companyId: t.companyId,
        newValue: { liters, total, currency: t.currency },
      },
      tx,
    );
    return { t, replay: false };
  });
  if (!done.replay) {
    try {
      await analyzeTransaction(transactionId);
    } catch (e) {
      logger.error("fuel.analysis.failed", { transactionId, error: e });
    }
  }
  return prisma.fuelTransaction.findUniqueOrThrow({ where: { id: transactionId } });
}

async function reverseInTx(tx: Tx, transactionId: string, reason: string, actor: Actor | null) {
  const t = await lockTx(tx, transactionId);
  await transition(tx, t, "REVERSED");
  if (Number(t.authorizedAmount) > 0) {
    await postAccountEntry(tx, {
      accountId: t.fuelAccountId,
      type: "RELEASE",
      amount: Number(t.authorizedAmount),
      idempotencyKey: `fuel:${t.id}:release`,
      fuelTransactionId: t.id,
      note: reason,
      userId: actor?.userId,
    });
  }
  await audit(
    actor,
    { action: AuditAction.FUEL_TX_REVERSED, entityType: "FuelTransaction", entityId: t.id, companyId: t.companyId, newValue: { reason } },
    tx,
  );
  return t;
}

async function refundInTx(tx: Tx, transactionId: string, reason: string, actor: Actor | null) {
  const t = await lockTx(tx, transactionId);
  await transition(tx, t, "REFUNDED");
  await postAccountEntry(tx, {
    accountId: t.fuelAccountId,
    type: "REFUND",
    amount: Number(t.totalAmount),
    idempotencyKey: `fuel:${t.id}:refund`,
    fuelTransactionId: t.id,
    note: reason,
    userId: actor?.userId,
  });
  await audit(
    actor,
    {
      action: AuditAction.FUEL_TX_REFUNDED,
      entityType: "FuelTransaction",
      entityId: t.id,
      companyId: t.companyId,
      newValue: { reason, amount: Number(t.totalAmount) },
    },
    tx,
  );
  return t;
}

/** Действия владельца над заправкой: отмена авторизации, возврат, спор с провайдером. */
export async function fuelTransactionAction(
  actor: Actor,
  transactionId: string,
  action: "REVERSE" | "REFUND" | "DISPUTE" | "RESOLVE_DISPUTE",
  reason: string,
) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  const t = await prisma.fuelTransaction.findFirst({ where: { id: transactionId, companyId: scope.companyId } });
  if (!t) throw errors.notFound("Заправка не найдена.");
  await prisma.$transaction(async (tx) => {
    if (action === "REVERSE") await reverseInTx(tx, t.id, reason, actor);
    else if (action === "REFUND") await refundInTx(tx, t.id, reason, actor);
    else {
      const cur = await lockTx(tx, t.id);
      await transition(tx, cur, action === "DISPUTE" ? "DISPUTED" : "COMPLETED");
      await audit(
        actor,
        {
          action: AuditAction.FUEL_TX_DISPUTED,
          entityType: "FuelTransaction",
          entityId: t.id,
          companyId: t.companyId,
          newValue: { action, reason },
        },
        tx,
      );
    }
  });
  return prisma.fuelTransaction.findUniqueOrThrow({ where: { id: t.id } });
}

/** Сообщение от процессинга топливных карт (webhook). Идемпотентно по providerTransactionId. */
export async function handleProviderEvent(
  provider: string,
  event: {
    type: "AUTHORIZATION_REQUEST" | "COMPLETED" | "REVERSED" | "REFUNDED";
    providerCardId: string;
    providerTransactionId: string;
    totalAmount?: number | null;
  } & Omit<PurchaseInput, "card" | "provider" | "providerTransactionId" | "source">,
) {
  if (!fuelCardProviderByCode(provider)) throw errors.notFound("Провайдер не настроен.");
  const find = () =>
    prisma.fuelTransaction.findUnique({
      where: { provider_providerTransactionId: { provider, providerTransactionId: event.providerTransactionId } },
    });
  if (event.type === "AUTHORIZATION_REQUEST" || event.type === "COMPLETED") {
    const auth = await authorizePurchase({
      ...event,
      card: { provider, providerCardId: event.providerCardId },
      provider,
      source: "PROVIDER",
    });
    if (event.type === "AUTHORIZATION_REQUEST") {
      return { transactionId: auth.transaction.id, approved: auth.approved, reasons: auth.violations.map((v) => v.code) };
    }
    if (!auth.approved) return { transactionId: auth.transaction.id, approved: false, reasons: auth.violations.map((v) => v.code) };
    const t = await completeTransaction(auth.transaction.id, {
      liters: event.liters,
      pricePerLiter: event.pricePerLiter,
      totalAmount: event.totalAmount,
    });
    return { transactionId: t.id, approved: true, status: t.status };
  }
  const t = await find();
  if (!t) throw errors.notFound("Транзакция не найдена.");
  if ((event.type === "REVERSED" && t.status === "REVERSED") || (event.type === "REFUNDED" && t.status === "REFUNDED")) {
    return { transactionId: t.id, status: t.status };
  }
  await prisma.$transaction((tx) =>
    event.type === "REVERSED" ? reverseInTx(tx, t.id, "Отмена провайдером", null) : refundInTx(tx, t.id, "Возврат провайдером", null),
  );
  return { transactionId: t.id, status: event.type };
}

/**
 * Демо-симулятор АЗС: авторизация и завершение заправки по демо-карте (реальные деньги и топливо не участвуют).
 * Для карт реального провайдера операции приходят только от провайдера.
 */
export async function simulatePurchase(
  actor: Actor,
  input: z.output<typeof fuelPurchaseSchema>,
  opts: { source: FuelTransactionSource; companyId: string; driverId?: string },
) {
  const card = await prisma.fuelCard.findFirst({ where: { id: input.fuelCardId, companyId: opts.companyId } });
  if (!card) throw errors.notFound("Топливная карта не найдена.");
  if (opts.driverId && card.driverId !== opts.driverId) throw errors.forbidden("Это не ваша топливная карта.");
  if (!card.isDemo) throw errors.forbidden("Заправки по реальной карте регистрирует процессинг топливных карт, а не приложение.");
  const auth = await authorizePurchase(
    {
      card: { id: card.id },
      provider: card.provider,
      providerTransactionId: `demo_tx_${randomUUID()}`,
      source: opts.source,
      stationName: input.stationName,
      stationBrand: input.stationBrand,
      stationId: input.stationId,
      stationAddress: input.stationAddress,
      stationCountry: input.stationCountry,
      latitude: input.latitude,
      longitude: input.longitude,
      fuelType: input.fuelType,
      liters: input.liters,
      pricePerLiter: input.pricePerLiter,
      transactionDate: input.transactionDate ?? new Date(),
      isDemo: true,
    },
    actor,
  );
  if (!auth.approved) return { ...auth, transaction: auth.transaction };
  const t = await completeTransaction(auth.transaction.id, {}, actor);
  return { ...auth, transaction: t };
}

export async function recordFromOwner(actor: Actor, input: z.output<typeof fuelPurchaseSchema>) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  return simulatePurchase(actor, input, { source: "DEMO", companyId: scope.companyId });
}

// ─────────── Списки ───────────

export function fuelTxWhere(companyId: string, q: Partial<z.output<typeof fuelListQuerySchema>>): Prisma.FuelTransactionWhereInput {
  return {
    companyId,
    ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
    ...(q.driverId ? { driverId: q.driverId } : {}),
    ...(q.orderId ? { orderId: q.orderId } : {}),
    ...(q.fuelType ? { fuelType: q.fuelType } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.match ? { matchStatus: q.match } : {}),
    ...(q.station ? { stationName: { contains: q.station, mode: "insensitive" as const } } : {}),
    ...(q.from || q.to
      ? {
          transactionDate: {
            ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:00`) } : {}),
            ...(q.to ? { lte: new Date(`${q.to}T23:59:59+05:00`) } : {}),
          },
        }
      : {}),
  };
}

export const fuelTxInclude = {
  vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
  driver: { select: { id: true, fullName: true } },
  card: { select: { id: true, label: true } },
  order: { select: { id: true, publicNumber: true } },
  _count: { select: { anomalies: true } },
} satisfies Prisma.FuelTransactionInclude;

export async function listFuelTransactions(actor: Actor, q: z.output<typeof fuelListQuerySchema>) {
  const scope = fuelScope(actor, "FUEL_VIEW");
  const where = fuelTxWhere(scope.companyId, q);
  const [items, total] = await Promise.all([
    prisma.fuelTransaction.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: fuelTxInclude,
    }),
    prisma.fuelTransaction.count({ where }),
  ]);
  // Финансы — только с правом FUEL_FINANCE_VIEW
  const money = actor.permissions.has("FUEL_FINANCE_VIEW");
  return {
    items: items.map((t) => (money ? t : { ...t, totalAmount: null, pricePerLiter: null, authorizedAmount: null })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function getFuelTransaction(actor: Actor, id: string) {
  const t = await prisma.fuelTransaction.findUnique({
    where: { id },
    include: { ...fuelTxInclude, anomalies: { orderBy: { score: "desc" } } },
  });
  if (!t) throw errors.notFound("Заправка не найдена.");
  if (!(actor.isAdmin && actor.permissions.has("FUEL_VIEW"))) {
    const scope = fuelScope(actor, "FUEL_VIEW");
    if (scope.companyId !== t.companyId) throw errors.notFound("Заправка не найдена.");
  }
  return canSeeFuelMoney(actor) ? t : hideFuelMoney(t);
}

/**
 * Водитель регистрирует заправку по своей карте (демо-режим). Ответ — без финансов компании:
 * «Заправка зарегистрирована» или причина отказа в формулировке для водителя.
 */
export async function driverRegisterRefuel(actor: Actor, input: z.output<typeof driverFuelPurchaseSchema>) {
  const profile = await driverProfileFor(actor);
  const card = await prisma.fuelCard.findFirst({
    where: { driverId: profile.id, status: { notIn: ["CANCELLED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  if (!card) throw errors.forbidden("Топливная карта не назначена. Обратитесь к диспетчеру.");
  const res = await simulatePurchase(
    actor,
    { ...input, fuelCardId: card.id, transactionDate: null },
    { source: "DRIVER_APP", companyId: card.companyId, driverId: profile.id },
  );
  return res.approved
    ? { approved: true, message: "Заправка зарегистрирована", liters: Number(res.transaction.liters) }
    : { approved: false, message: res.violations.map((v) => v.driverMessage).join(" ") };
}
