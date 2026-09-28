import "server-only";
import type { CargoType, Currency } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requirePermission, type Actor } from "@/lib/auth/actor";
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
  supportEmail: "",
};

export async function getSettings(tx: Tx = prisma): Promise<PlatformSettings> {
  const rows = await tx.platformSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...(map as Partial<PlatformSettings>) };
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
  return getSettings();
}
