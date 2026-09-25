import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { toPlain } from "@/lib/serialize";
import type { AuditAction } from "./actions";

export { AuditAction } from "./actions";

export type AuditEntry = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  companyId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

function json(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(toPlain(v))) as Prisma.InputJsonValue;
}

/**
 * Запись в журнал аудита. Передавайте tx, чтобы запись была атомарна с бизнес-операцией.
 * Журнал только дополняется — удаление/изменение записей в системе не предусмотрено.
 */
export async function audit(actor: Pick<Actor, "userId" | "active" | "ip" | "userAgent"> | null, entry: AuditEntry, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      actorUserId: actor?.userId ?? null,
      companyId: entry.companyId !== undefined ? entry.companyId : (actor?.active?.companyId ?? null),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValue: json(entry.oldValue),
      newValue: json(entry.newValue),
      ipAddress: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
    },
  });
}
