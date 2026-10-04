import "server-only";
import type { MemberRole, NotificationType } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { externalAdapters } from "@/lib/notifications/adapters";

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  /** Не уведомлять инициатора действия. */
  excludeUserId?: string;
};

/**
 * In-app уведомления создаются в той же транзакции, что и бизнес-операция.
 * Внешние каналы (email и др.) отправляются после фиксации транзакции:
 * если транзакция откатилась, записи не будет и внешняя отправка будет пропущена.
 */
export async function notify(tx: Tx, input: NotifyInput) {
  const recipients = [...new Set(input.userIds)].filter((id) => id && id !== input.excludeUserId);
  if (recipients.length === 0) return;
  // Один запрос: параллельные запросы в рамках транзакции на одном соединении не допускаются
  const created = await tx.notification.createManyAndReturn({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link,
    })),
    select: { id: true },
  });
  scheduleExternal(created.map((c) => c.id));
}

/**
 * Внешняя отправка после фиксации транзакции. Уведомления создаются внутри бизнес-транзакции, поэтому
 * отправка ждёт, пока записи станут видимы (коммит), с нарастающей задержкой до ~30 с.
 * Если записи так и не появились — транзакция откатилась, и отправлять нечего.
 */
function scheduleExternal(ids: string[]) {
  const enabled = externalAdapters.filter((a) => a.isEnabled());
  if (enabled.length === 0 || process.env.NODE_ENV === "test") return;
  const delays = [250, 1_000, 3_000, 8_000, 20_000];
  const attempt = (i: number) =>
    setTimeout(async () => {
      try {
        const rows = await prisma.notification.findMany({
          where: { id: { in: ids } },
          include: { user: { select: { email: true, phone: true } } },
        });
        if (rows.length < ids.length && i + 1 < delays.length) return attempt(i + 1);
        for (const n of rows) {
          for (const a of enabled) {
            await a
              .send({
                userId: n.userId,
                email: n.user.email,
                phone: n.user.phone,
                type: n.type,
                title: n.title,
                body: n.body,
                link: n.link,
              })
              .catch((e) => logger.warn("notification.adapter_failed", { channel: a.channel, error: e }));
          }
        }
      } catch (e) {
        logger.warn("notification.dispatch_failed", { error: e });
      }
    }, delays[i]);
  attempt(0);
}

/** Пользователи компании (активные участники), опционально — только с указанными ролями. */
export async function companyUserIds(tx: Tx, companyId: string | null | undefined, roles?: MemberRole[]) {
  if (!companyId) return [];
  const members = await tx.companyMember.findMany({
    where: { companyId, status: "ACTIVE", ...(roles ? { role: { in: roles } } : {}), user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export const CUSTOMER_ROLES: MemberRole[] = ["SHIPPER", "FORWARDER"];
export const CARRIER_OFFICE_ROLES: MemberRole[] = ["CARRIER_ADMIN", "CARRIER_DISPATCHER"];

// ───────── API для пользователя ─────────

export async function listNotifications(actor: Actor, opts: { page: number; pageSize: number; unreadOnly?: boolean }) {
  const where = { userId: actor.userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
  ]);
  return { items, total, unread, page: opts.page, pageSize: opts.pageSize };
}

export async function markNotificationRead(actor: Actor, id: string) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.userId !== actor.userId) throw errors.notFound("Уведомление не найдено.");
  if (n.readAt) return n;
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(actor: Actor) {
  const res = await prisma.notification.updateMany({
    where: { userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}

export async function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
