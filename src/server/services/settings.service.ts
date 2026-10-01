import "server-only";
import type { CargoType, Currency } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requirePermission, type Actor } from "@/lib/auth/actor";
import { currentDataMode, type DataMode } from "@/lib/db/data-mode";
import { prisma, type Tx } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";

export type PlatformSettings = {
  /** Комиссия платформы по безопасной сделке, % от суммы */
  commissionPercent: number;
  /** Фиксированная часть комиссии по безопасной сделке — в валюте сделки */
  commissionFixed: Partial<Record<Currency, number>>;
  /** Заказчик может оформить безопасную сделку */
  secureDealEnabled: boolean;
  /** Начало загрузки возможно только после обеспечения оплаты безопасной сделкой */
  requireSecureDeal: boolean;
  /** Период проверки после доставки: сколько часов у заказчика на подтверждение или спор */
  confirmationWindowHours: number;
  /** По истечении периода проверки без спора — подтвердить получение и выплатить перевозчику автоматически */
  autoConfirmOnTimeout: boolean;
  requirePodForClose: boolean;
  restrictedCargoTypes: CargoType[];
  requireVerifiedToPublish: boolean;
  /** Ставки и сделки — только с проверенными перевозчиками */
  requireVerifiedToBid: boolean;
  supportEmail: string;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  commissionPercent: 0,
  commissionFixed: {},
  secureDealEnabled: true,
  requireSecureDeal: false,
  confirmationWindowHours: 72,
  autoConfirmOnTimeout: true,
  requirePodForClose: true,
  restrictedCargoTypes: [],
  requireVerifiedToPublish: false,
  requireVerifiedToBid: false,
  supportEmail: "",
};

/** Короткий кэш: настройки читаются почти в каждой операции, а меняются редко. */
const CACHE_MS = 5_000;
// Кеш по режиму данных: настройки демо-базы не должны попадать в реальный режим и наоборот.
const g = globalThis as unknown as { __cfSettings?: Partial<Record<DataMode, { at: number; value: PlatformSettings }>> };

export async function getSettings(tx: Tx = prisma): Promise<PlatformSettings> {
  const mode = currentDataMode() ?? "real";
  const cached = g.__cfSettings?.[mode];
  if (cached && Date.now() - cached.at < CACHE_MS && process.env.NODE_ENV !== "test") return cached.value;
  const rows = await tx.platformSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const value = { ...DEFAULT_SETTINGS, ...(map as Partial<PlatformSettings>) };
  (g.__cfSettings ??= {})[mode] = { at: Date.now(), value };
  return value;
}

export function invalidateSettingsCache() {
  g.__cfSettings = undefined;
}

export async function updateSettings(actor: Actor, input: PlatformSettings) {
  requirePermission(actor, "ADMIN_SETTINGS");
  if (input.requireSecureDeal && !input.secureDealEnabled) {
    throw errors.validation("Нельзя требовать безопасную сделку, если она отключена.", {
      requireSecureDeal: ["Противоречит отключённой сделке"],
    });
  }
  const before = await getSettings();
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(input)) {
      await tx.platformSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      });
    }
    await audit(
      actor,
      { action: AuditAction.SETTINGS_UPDATED, entityType: "PlatformSetting", oldValue: before, newValue: input, companyId: null },
      tx,
    );
  });
  invalidateSettingsCache();
  return getSettings();
}
