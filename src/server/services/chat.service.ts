import "server-only";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { ordersWhereForActor, requireOrderAccess } from "./access";
import { notify } from "./notification.service";
import { orderParticipantUserIds } from "./order-core";
import { DRIVER_DOCUMENT_TYPES } from "./document.service";

async function threadFor(orderId: string) {
  return prisma.chatThread.upsert({ where: { orderId }, create: { orderId }, update: {} });
}

/** Сообщения чата с курсорной пагинацией (не загружаем всю историю сразу). */
export async function listMessages(actor: Actor, orderId: string, opts: { before?: string | null; after?: string | null; limit: number }) {
  await requireOrderAccess(actor, orderId, "CHAT_VIEW");
  const thread = await threadFor(orderId);
  const where = {
    threadId: thread.id,
    ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    ...(opts.after ? { createdAt: { gt: new Date(opts.after) } } : {}),
  };
  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: opts.after ? "asc" : "desc" },
    take: opts.limit + 1,
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          memberships: { select: { companyId: true, company: { select: { legalName: true } } } },
        },
      },
      attachment: { select: { id: true, filename: true, mimeType: true, size: true, type: true, status: true } },
    },
  });
  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const items = (opts.after ? page : page.reverse()).map((m) => ({
    id: m.id,
    message: m.message,
    createdAt: m.createdAt,
    readAt: m.readAt,
    mine: m.senderUserId === actor.userId,
    sender: {
      id: m.sender.id,
      name: `${m.sender.firstName} ${m.sender.lastName}`,
      company: m.sender.memberships.find((x) => x.companyId === m.senderCompanyId)?.company.legalName ?? null,
    },
    attachment: m.attachment && m.attachment.status !== "DELETED" ? m.attachment : null,
  }));
  // Отмечаем прочтение
  const now = new Date();
  await prisma.chatReadState.upsert({
    where: { threadId_userId: { threadId: thread.id, userId: actor.userId } },
    create: { threadId: thread.id, userId: actor.userId, lastReadAt: now },
    update: { lastReadAt: now },
  });
  await prisma.chatMessage.updateMany({
    where: { threadId: thread.id, senderUserId: { not: actor.userId }, readAt: null },
    data: { readAt: now },
  });
  return { items, hasMore };
}

export async function sendMessage(actor: Actor, orderId: string, input: { message: string; attachmentId?: string | null }) {
  const { access, order } = await requireOrderAccess(actor, orderId, "CHAT_SEND");
  enforceRateLimit("chat", actor.userId);
  const text = input.message.trim();
  if (!text && !input.attachmentId) throw errors.validation("Введите сообщение или приложите файл.");
  if (order.currentStatus === "CANCELLED")
    throw new AppError("INVALID_STATE_TRANSITION", "Чат отменённой перевозки доступен только для чтения.");
  if (input.attachmentId) {
    const doc = await prisma.orderDocument.findUnique({ where: { id: input.attachmentId } });
    if (!doc || doc.orderId !== orderId || doc.status !== "ACTIVE") throw errors.validation("Вложение не найдено в документах перевозки.");
    if (access.side === "DRIVER" && !DRIVER_DOCUMENT_TYPES.includes(doc.type)) throw errors.forbidden();
  }
  const thread = await threadFor(orderId);
  return prisma.$transaction(async (tx) => {
    const msg = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderUserId: actor.userId,
        senderCompanyId: access.membership?.companyId ?? null,
        message: text,
        attachmentId: input.attachmentId ?? null,
      },
    });
    await tx.chatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    await audit(
      actor,
      {
        action: AuditAction.MESSAGE_SENT,
        entityType: "TransportOrder",
        entityId: orderId,
        companyId: access.membership?.companyId ?? null,
        newValue: { messageId: msg.id },
      },
      tx,
    );
    const full = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, full),
      excludeUserId: actor.userId,
      type: "NEW_MESSAGE",
      title: `${full.publicNumber}: новое сообщение`,
      body: `${actor.fullName}: ${text ? text.slice(0, 140) : "файл"}`,
      entityType: "TransportOrder",
      entityId: orderId,
      link: `/orders/${orderId}?tab=chat`,
    });
    return msg;
  });
}

/** Чаты пользователя с количеством непрочитанных (раздел «Сообщения»). */
export async function listThreads(actor: Actor, opts: { page: number; pageSize: number }) {
  const where = { order: ordersWhereForActor(actor) };
  const threads = await prisma.chatThread.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (opts.page - 1) * opts.pageSize,
    take: opts.pageSize,
    include: {
      order: {
        select: {
          id: true,
          publicNumber: true,
          currentStatus: true,
          shipper: { select: { legalName: true } },
          carrier: { select: { legalName: true } },
          load: { select: { originCity: true, destinationCity: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { firstName: true, lastName: true } } } },
      readStates: { where: { userId: actor.userId } },
    },
  });
  const withUnread = await Promise.all(
    threads.map(async (t) => {
      const lastRead = t.readStates[0]?.lastReadAt ?? new Date(0);
      const unread = await prisma.chatMessage.count({
        where: { threadId: t.id, senderUserId: { not: actor.userId }, createdAt: { gt: lastRead } },
      });
      const last = t.messages[0];
      return {
        id: t.id,
        order: t.order,
        unread,
        lastMessage: last ? { text: last.message, at: last.createdAt, sender: `${last.sender.firstName} ${last.sender.lastName}` } : null,
      };
    }),
  );
  withUnread.sort((a, b) => (b.lastMessage?.at.getTime() ?? 0) - (a.lastMessage?.at.getTime() ?? 0));
  const total = await prisma.chatThread.count({ where });
  return { items: withUnread, total, page: opts.page, pageSize: opts.pageSize };
}

export async function unreadForOrder(actor: Actor, orderId: string) {
  const thread = await prisma.chatThread.findUnique({ where: { orderId }, include: { readStates: { where: { userId: actor.userId } } } });
  if (!thread) return 0;
  const lastRead = thread.readStates[0]?.lastReadAt ?? new Date(0);
  return prisma.chatMessage.count({ where: { threadId: thread.id, senderUserId: { not: actor.userId }, createdAt: { gt: lastRead } } });
}

/** Общее количество непрочитанных сообщений пользователя (для бейджа в меню). */
export async function unreadMessagesTotal(actor: Actor): Promise<number> {
  const orders = await prisma.transportOrder.findMany({
    where: ordersWhereForActor(actor),
    select: { id: true },
    take: 500,
    orderBy: { updatedAt: "desc" },
  });
  if (orders.length === 0) return 0;
  const ids = orders.map((o) => o.id);
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n
    FROM "ChatMessage" m
    JOIN "ChatThread" t ON t.id = m."threadId"
    LEFT JOIN "ChatReadState" r ON r."threadId" = t.id AND r."userId" = ${actor.userId}::uuid
    WHERE t."orderId" = ANY(${ids}::uuid[])
      AND m."senderUserId" <> ${actor.userId}::uuid
      AND m."createdAt" > COALESCE(r."lastReadAt", 'epoch'::timestamptz)`;
  return Number(rows[0]?.n ?? 0);
}
