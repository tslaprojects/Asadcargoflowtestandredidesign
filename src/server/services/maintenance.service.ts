import "server-only";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

const DAY = 24 * 60 * 60_000;

/**
 * Периодическое обслуживание данных (запускается вместе с плановой задачей безопасной сделки):
 *  - истёкшие планы «Следующего рейса» и топливные карты получают статус EXPIRED;
 *  - удаляются служебные записи, которые больше не нужны (ключи идемпотентности, завершённые сессии,
 *    использованные/истёкшие ссылки сброса пароля, давно прочитанные уведомления).
 */
export async function runMaintenance(now = new Date()) {
  const [movements, cards, idempotency, sessions, resetTokens, notifications] = await Promise.all([
    prisma.plannedMovement.updateMany({ where: { status: "ACTIVE", availableUntil: { lt: now } }, data: { status: "EXPIRED" } }),
    prisma.fuelCard.updateMany({
      where: { status: { in: ["ACTIVE", "BLOCKED", "SUSPENDED"] }, expiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    }),
    prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date(now.getTime() - 30 * DAY) } }, { revokedAt: { lt: new Date(now.getTime() - 30 * DAY) } }],
      },
    }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.notification.deleteMany({ where: { readAt: { lt: new Date(now.getTime() - 180 * DAY) } } }),
  ]);
  const result = {
    movementsExpired: movements.count,
    fuelCardsExpired: cards.count,
    removed: {
      idempotencyKeys: idempotency.count,
      sessions: sessions.count,
      passwordResetTokens: resetTokens.count,
      notifications: notifications.count,
    },
  };
  logger.info("job.maintenance", result);
  return result;
}
