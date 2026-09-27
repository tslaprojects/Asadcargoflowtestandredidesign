import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Currency, FuelCardStatus } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import type { FuelCardLimits } from "@/lib/fuel/limits";
import { fuelCardProviderByCode, getFuelCardProvider } from "@/lib/fuel/providers";
import { fromMinor, toMinor } from "@/lib/money";
import type {
  fuelCardCreateSchema,
  fuelCardLimitsSchema,
  fuelCardAssignSchema,
  fuelTopUpSchema,
  vehicleFuelSettingsSchema,
} from "@/lib/validation/fuel";
import { fuelScope, requireFleetVehicle } from "./fuel-access";
import { notify } from "./notification.service";

const n = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));

export function cardLimits(card: {
  perTransactionLiters: Prisma.Decimal | null;
  dailyLiters: Prisma.Decimal | null;
  monthlyLiters: Prisma.Decimal | null;
  dailyAmount: Prisma.Decimal | null;
  monthlyAmount: Prisma.Decimal | null;
  allowedFuelTypes: FuelCardLimits["allowedFuelTypes"];
  allowedStationBrands: string[];
  allowedStationIds: string[];
  allowedRegions: string[];
  allowedFromMinute: number | null;
  allowedToMinute: number | null;
  timezone: string;
}): FuelCardLimits {
  return {
    perTransactionLiters: n(card.perTransactionLiters),
    dailyLiters: n(card.dailyLiters),
    monthlyLiters: n(card.monthlyLiters),
    dailyAmount: n(card.dailyAmount),
    monthlyAmount: n(card.monthlyAmount),
    allowedFuelTypes: card.allowedFuelTypes,
    allowedStationBrands: card.allowedStationBrands,
    allowedStationIds: card.allowedStationIds,
    allowedRegions: card.allowedRegions,
    allowedFromMinute: card.allowedFromMinute,
    allowedToMinute: card.allowedToMinute,
    timezone: card.timezone,
  };
}

export async function lockAccount(tx: Tx, accountId: string) {
  await tx.$queryRaw`SELECT id FROM "FuelAccount" WHERE id = ${accountId}::uuid FOR UPDATE`;
  return tx.fuelAccount.findUniqueOrThrow({ where: { id: accountId } });
}

/** Запись в журнал счёта с изменением баланса/резерва. Вызывается только под блокировкой счёта. */
export async function postAccountEntry(
  tx: Tx,
  input: {
    accountId: string;
    type: "TOP_UP" | "RESERVE" | "RELEASE" | "CHARGE" | "REFUND" | "ADJUSTMENT";
    amount: number;
    idempotencyKey: string;
    fuelTransactionId?: string | null;
    externalReference?: string | null;
    note?: string | null;
    userId?: string | null;
  },
) {
  const acc = await tx.fuelAccount.findUniqueOrThrow({ where: { id: input.accountId } });
  let balance = toMinor(Number(acc.balance));
  let reserved = toMinor(Number(acc.reserved));
  const amt = toMinor(input.amount);
  if (amt <= 0) throw errors.validation("Сумма операции должна быть больше 0.");
  switch (input.type) {
    case "TOP_UP":
    case "REFUND":
      balance += amt;
      break;
    case "RESERVE":
      reserved += amt;
      break;
    case "RELEASE":
      reserved -= amt;
      break;
    case "CHARGE":
      balance -= amt;
      break;
    case "ADJUSTMENT":
      balance += amt;
      break;
  }
  if (balance < 0 || reserved < 0 || reserved > balance) {
    throw new AppError("CONFLICT", "Операция нарушает баланс топливного счёта.");
  }
  await tx.fuelAccount.update({ where: { id: acc.id }, data: { balance: fromMinor(balance), reserved: fromMinor(reserved) } });
  return tx.fuelAccountEntry.create({
    data: {
      accountId: acc.id,
      type: input.type,
      amount: input.amount,
      balanceAfter: fromMinor(balance),
      reservedAfter: fromMinor(reserved),
      fuelTransactionId: input.fuelTransactionId ?? null,
      externalReference: input.externalReference ?? null,
      note: input.note ?? null,
      createdByUserId: input.userId ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

// ─────────── Топливный счёт ───────────

export async function getOrCreateAccount(actor: Actor, currency: Currency) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  const existing = await prisma.fuelAccount.findUnique({ where: { companyId_currency: { companyId: scope.companyId, currency } } });
  if (existing) return existing;
  const provider = getFuelCardProvider();
  try {
    return await prisma.$transaction(async (tx) => {
      const acc = await tx.fuelAccount.create({
        data: {
          companyId: scope.companyId,
          name: `Корпоративный топливный счёт (${currency})`,
          currency,
          provider: provider.code,
          isDemo: provider.demo,
        },
      });
      await audit(
        actor,
        { action: AuditAction.FUEL_ACCOUNT_CREATED, entityType: "FuelAccount", entityId: acc.id, newValue: { currency } },
        tx,
      );
      return acc;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.fuelAccount.findUniqueOrThrow({ where: { companyId_currency: { companyId: scope.companyId, currency } } });
    }
    throw e;
  }
}

/**
 * Пополнение топливного счёта. CargoFlow не принимает деньги: владелец фиксирует пополнение, выполненное у провайдера
 * топливных карт (номер платёжного поручения). В демо-режиме пополнение помечается как демо.
 */
export async function topUpAccount(actor: Actor, input: z.output<typeof fuelTopUpSchema>, idempotencyKey: string) {
  fuelScope(actor, "FUEL_FINANCE_VIEW");
  const acc = await getOrCreateAccount(actor, input.currency);
  return prisma.$transaction(async (tx) => {
    await lockAccount(tx, acc.id);
    const dup = await tx.fuelAccountEntry.findUnique({ where: { idempotencyKey: `topup:${acc.id}:${idempotencyKey}` } });
    if (dup) return dup;
    const entry = await postAccountEntry(tx, {
      accountId: acc.id,
      type: "TOP_UP",
      amount: input.amount,
      idempotencyKey: `topup:${acc.id}:${idempotencyKey}`,
      externalReference: input.reference,
      note: input.note ?? (acc.isDemo ? "Демо-пополнение" : null),
      userId: actor.userId,
    });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_ACCOUNT_TOPPED_UP,
        entityType: "FuelAccount",
        entityId: acc.id,
        newValue: { amount: input.amount, currency: acc.currency, reference: input.reference, balanceAfter: Number(entry.balanceAfter) },
      },
      tx,
    );
    return entry;
  });
}

export async function getAccounts(actor: Actor) {
  const scope = fuelScope(actor, "FUEL_FINANCE_VIEW");
  const accounts = await prisma.fuelAccount.findMany({ where: { companyId: scope.companyId }, orderBy: { currency: "asc" } });
  const entries = await prisma.fuelAccountEntry.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return {
    accounts: accounts.map((a) => ({
      ...a,
      balance: Number(a.balance),
      reserved: Number(a.reserved),
      available: fromMinor(toMinor(Number(a.balance)) - toMinor(Number(a.reserved))),
    })),
    entries: entries.map((e) => ({
      ...e,
      amount: Number(e.amount),
      balanceAfter: Number(e.balanceAfter),
      reservedAfter: Number(e.reservedAfter),
      currency: accounts.find((a) => a.id === e.accountId)?.currency ?? "KZT",
    })),
  };
}

// ─────────── Топливные карты ───────────

async function validateBindings(companyId: string, vehicleId: string | null | undefined, driverId: string | null | undefined) {
  if (vehicleId) await requireFleetVehicle(companyId, vehicleId);
  if (driverId) {
    const d = await prisma.driverProfile.findFirst({ where: { id: driverId, companyId, deletedAt: null } });
    if (!d) throw errors.notFound("Водитель не найден в вашей компании.");
  }
}

function limitsData(input: z.output<typeof fuelCardLimitsSchema>) {
  return {
    perTransactionLiters: input.perTransactionLiters,
    dailyLiters: input.dailyLiters,
    monthlyLiters: input.monthlyLiters,
    dailyAmount: input.dailyAmount,
    monthlyAmount: input.monthlyAmount,
    allowedFuelTypes: input.allowedFuelTypes,
    allowedStationBrands: input.allowedStationBrands,
    allowedStationIds: input.allowedStationIds,
    allowedRegions: input.allowedRegions,
    allowedFromMinute: input.allowedFromMinute,
    allowedToMinute: input.allowedToMinute,
    driverCanSeeFuelLevel: input.driverCanSeeFuelLevel,
  };
}

export async function issueFuelCard(actor: Actor, input: z.output<typeof fuelCardCreateSchema>) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  await validateBindings(scope.companyId, input.vehicleId, input.driverId);
  const account = await getOrCreateAccount(actor, input.currency);
  const provider = getFuelCardProvider();
  const issued = await provider.issueCard({ companyId: scope.companyId, label: input.label.trim().toUpperCase() });
  try {
    return await prisma.$transaction(async (tx) => {
      const card = await tx.fuelCard.create({
        data: {
          companyId: scope.companyId,
          fuelAccountId: account.id,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          label: input.label.trim().toUpperCase(),
          provider: provider.code,
          providerCardId: issued.providerCardId,
          last4: issued.last4,
          expiresAt: issued.expiresAt,
          isDemo: provider.demo,
          createdByUserId: actor.userId,
          ...limitsData(input),
        },
      });
      await audit(
        actor,
        {
          action: AuditAction.FUEL_CARD_ISSUED,
          entityType: "FuelCard",
          entityId: card.id,
          newValue: {
            label: card.label,
            vehicleId: card.vehicleId,
            driverId: card.driverId,
            provider: provider.code,
            limits: limitsData(input),
          },
        },
        tx,
      );
      await notifyDriver(tx, card.driverId, `Вам выдана топливная карта ${card.label}`, "Статус и лимиты — в разделе «Топливо».");
      return card;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", `Карта с номером «${input.label}» уже есть в компании.`);
    }
    throw e;
  }
}

async function notifyDriver(tx: Tx, driverId: string | null, title: string, body: string) {
  if (!driverId) return;
  const d = await tx.driverProfile.findUnique({ where: { id: driverId }, select: { userId: true } });
  if (!d?.userId) return;
  await notify(tx, { userIds: [d.userId], type: "FUEL_CARD_UPDATED", title, body, link: "/driver/fuel" });
}

async function loadCard(companyId: string, cardId: string) {
  const card = await prisma.fuelCard.findFirst({ where: { id: cardId, companyId } });
  if (!card) throw errors.notFound("Топливная карта не найдена.");
  return card;
}

const MANAGEABLE: Record<FuelCardStatus, FuelCardStatus[]> = {
  ACTIVE: ["BLOCKED", "SUSPENDED", "LOST", "CANCELLED"],
  BLOCKED: ["ACTIVE", "LOST", "CANCELLED"],
  SUSPENDED: ["ACTIVE", "BLOCKED", "CANCELLED"],
  LOST: ["CANCELLED"],
  EXPIRED: ["CANCELLED"],
  CANCELLED: [],
};

/** Блокировка / разблокировка / приостановка / утеря / аннулирование. Синхронизируется с провайдером. */
export async function setFuelCardStatus(actor: Actor, cardId: string, status: FuelCardStatus, reason: string | null) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  const card = await loadCard(scope.companyId, cardId);
  if (card.status === status) throw new AppError("DUPLICATE_ACTION", "Карта уже в этом статусе.");
  if (!MANAGEABLE[card.status].includes(status))
    throw new AppError("INVALID_STATE_TRANSITION", "Такое изменение статуса карты недопустимо.");
  if (status === "ACTIVE" && card.expiresAt && card.expiresAt < new Date()) {
    throw new AppError("INVALID_STATE_TRANSITION", "Срок действия карты истёк — выпустите новую карту.");
  }
  const provider = fuelCardProviderByCode(card.provider);
  await provider?.setCardStatus(card.providerCardId, status === "ACTIVE" ? "ACTIVE" : "BLOCKED");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.fuelCard.update({
      where: { id: card.id },
      data: { status, blockedReason: status === "ACTIVE" ? null : reason },
    });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_CARD_STATUS_CHANGED,
        entityType: "FuelCard",
        entityId: card.id,
        oldValue: { status: card.status },
        newValue: { status, reason },
      },
      tx,
    );
    await notifyDriver(
      tx,
      card.driverId,
      status === "ACTIVE" ? `Топливная карта ${card.label} активна` : `Топливная карта ${card.label} заблокирована`,
      status === "ACTIVE" ? "Оплата топлива снова разрешена." : "Оплата топлива по карте временно недоступна. Обратитесь к диспетчеру.",
    );
    return updated;
  });
}

export async function updateFuelCardLimits(actor: Actor, cardId: string, input: z.output<typeof fuelCardLimitsSchema>) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  const card = await loadCard(scope.companyId, cardId);
  if (card.status === "CANCELLED") throw new AppError("INVALID_STATE_TRANSITION", "Карта аннулирована.");
  const updatedLimits = { ...cardLimits(card), ...limitsData(input), timezone: card.timezone };
  await fuelCardProviderByCode(card.provider)?.syncLimits(card.providerCardId, updatedLimits);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.fuelCard.update({ where: { id: card.id }, data: limitsData(input) });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_CARD_LIMITS_CHANGED,
        entityType: "FuelCard",
        entityId: card.id,
        oldValue: { ...cardLimits(card), driverCanSeeFuelLevel: card.driverCanSeeFuelLevel },
        newValue: limitsData(input),
      },
      tx,
    );
    return updated;
  });
}

export async function assignFuelCard(actor: Actor, cardId: string, input: z.output<typeof fuelCardAssignSchema>) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  const card = await loadCard(scope.companyId, cardId);
  if (card.status === "CANCELLED") throw new AppError("INVALID_STATE_TRANSITION", "Карта аннулирована.");
  await validateBindings(scope.companyId, input.vehicleId, input.driverId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.fuelCard.update({ where: { id: card.id }, data: { vehicleId: input.vehicleId, driverId: input.driverId } });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_CARD_ASSIGNED,
        entityType: "FuelCard",
        entityId: card.id,
        oldValue: { vehicleId: card.vehicleId, driverId: card.driverId },
        newValue: { vehicleId: input.vehicleId, driverId: input.driverId },
      },
      tx,
    );
    if (input.driverId !== card.driverId) {
      await notifyDriver(tx, input.driverId, `Вам выдана топливная карта ${card.label}`, "Статус и лимиты — в разделе «Топливо».");
      await notifyDriver(
        tx,
        card.driverId,
        `Топливная карта ${card.label} передана другому водителю`,
        "Карта больше не закреплена за вами.",
      );
    }
    return updated;
  });
}

export async function listFuelCards(actor: Actor) {
  const scope = fuelScope(actor, "FUEL_VIEW");
  const cards = await prisma.fuelCard.findMany({
    where: { companyId: scope.companyId },
    orderBy: [{ status: "asc" }, { label: "asc" }],
    include: {
      vehicle: { select: { id: true, plateNumber: true, make: true, model: true } },
      driver: { select: { id: true, fullName: true } },
      account: { select: { currency: true } },
    },
  });
  // providerCardId — внутренний токен провайдера, в интерфейс не отдаётся
  return cards.map(({ providerCardId: _token, ...c }) => ({ ...c, limits: cardLimits(c) }));
}

// ─────────── Топливные параметры автомобиля и подключение телематики ───────────

export async function updateVehicleFuelSettings(actor: Actor, vehicleId: string, input: z.output<typeof vehicleFuelSettingsSchema>) {
  const scope = fuelScope(actor, "FUEL_MANAGE");
  const v = await requireFleetVehicle(scope.companyId, vehicleId);
  const before = {
    fuelType: v.fuelType,
    engineType: v.engineType,
    tankCapacityLiters: n(v.tankCapacityLiters),
    fuelNormPer100Km: n(v.fuelNormPer100Km),
    telematicsProvider: v.telematicsProvider,
    telematicsDeviceId: v.telematicsDeviceId,
  };
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({ where: { id: v.id }, data: input });
      const telematicsChanged =
        before.telematicsProvider !== input.telematicsProvider || before.telematicsDeviceId !== input.telematicsDeviceId;
      await audit(
        actor,
        { action: AuditAction.VEHICLE_FUEL_SETTINGS_CHANGED, entityType: "Vehicle", entityId: v.id, oldValue: before, newValue: input },
        tx,
      );
      if (telematicsChanged) {
        await audit(
          actor,
          {
            action: AuditAction.TELEMATICS_LINKED,
            entityType: "Vehicle",
            entityId: v.id,
            oldValue: { provider: before.telematicsProvider, deviceId: before.telematicsDeviceId },
            newValue: { provider: input.telematicsProvider, deviceId: input.telematicsDeviceId },
          },
          tx,
        );
      }
      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "Это устройство телематики уже привязано к другому автомобилю.");
    }
    throw e;
  }
}
