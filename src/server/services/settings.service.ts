import "server-only";
import type { CargoType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requirePermission, type Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";

export type PlatformSettings = {
  commissionPercent: number;
  requirePodForClose: boolean;
  restrictedCargoTypes: CargoType[];
  requireVerifiedToPublish: boolean;
  supportEmail: string;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  commissionPercent: 0,
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
