import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { label } from "@/lib/i18n";
import { DISPUTABLE_STATUSES } from "@/lib/state-machine/order-state-machine";
import type { disputeCreateSchema, disputeUpdateSchema } from "@/lib/validation/order";
import { ordersWhereForActor, requireOrderAccess } from "./access";
import { notify } from "./notification.service";
import { orderParticipantUserIds, performTransitionInTx } from "./order-core";

async function adminIds(tx: Prisma.TransactionClient) {
  const admins = await tx.user.findMany({ where: { platformRole: "PLATFORM_ADMIN", status: "ACTIVE" }, select: { id: true } });
  return admins.map((a) => a.id);
}

export async function openDispute(actor: Actor, orderId: string, input: z.output<typeof disputeCreateSchema>) {
  const { access, order } = await requireOrderAccess(actor, orderId, "DISPUTE_CREATE");
  if (access.side !== "CUSTOMER" && access.side !== "CARRIER" && access.side !== "ADMIN") {
    throw errors.forbidden("Открыть спор могут стороны сделки.");
  }
  if (order.currentStatus === "DISPUTED") throw new AppError("DUPLICATE_ACTION", "По перевозке уже открыт спор.");
  if (!DISPUTABLE_STATUSES.includes(order.currentStatus)) {
    throw new AppError("INVALID_STATE_TRANSITION", "В текущем статусе перевозки открыть спор нельзя.");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          orderId,
          openedByUserId: actor.userId,
          openedByCompanyId: access.membership?.companyId ?? null,
          reason: input.reason,
          description: input.description,
          orderStatusBefore: order.currentStatus,
        },
      });
      await performTransitionInTx(tx, {
        orderId,
        to: "DISPUTED",
        side: access.side,
        actor,
        source: "WEB",
        comment: `Открыт спор: ${label("DisputeReason", input.reason)}`,
        silent: true,
      });
      await audit(
        actor,
        {
          action: AuditAction.DISPUTE_OPENED,
          entityType: "TransportOrder",
          entityId: orderId,
          companyId: access.membership?.companyId ?? null,
          newValue: { disputeId: dispute.id, reason: input.reason },
        },
        tx,
      );
      const full = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
      await notify(tx, {
        userIds: [...(await orderParticipantUserIds(tx, full)), ...(await adminIds(tx))],
        excludeUserId: actor.userId,
        type: "DISPUTE_CREATED",
        title: `${full.publicNumber}: открыт спор`,
        body: `${label("DisputeReason", input.reason)}. Перевозка приостановлена до решения администратора.`,
        entityType: "TransportOrder",
        entityId: orderId,
        link: `/orders/${orderId}?tab=dispute`,
      });
      return dispute;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE_ACTION", "По перевозке уже открыт спор.");
    }
    throw e;
  }
}

export async function commentDispute(actor: Actor, disputeId: string, message: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw errors.notFound("Спор не найден.");
  const { access } = await requireOrderAccess(actor, dispute.orderId);
  if (access.side === "DRIVER") throw errors.forbidden();
  if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") throw new AppError("INVALID_STATE_TRANSITION", "Спор закрыт.");
  return prisma.$transaction(async (tx) => {
    const c = await tx.disputeComment.create({ data: { disputeId, authorUserId: actor.userId, message } });
    await audit(
      actor,
      { action: AuditAction.DISPUTE_COMMENTED, entityType: "TransportOrder", entityId: dispute.orderId, newValue: { disputeId } },
      tx,
    );
    const full = await tx.transportOrder.findUniqueOrThrow({ where: { id: dispute.orderId } });
    await notify(tx, {
      userIds: [...(await orderParticipantUserIds(tx, full, { customer: true, carrier: true })), ...(await adminIds(tx))],
      excludeUserId: actor.userId,
      type: "DISPUTE_UPDATED",
      title: `${full.publicNumber}: комментарий в споре`,
      body: message.slice(0, 140),
      entityType: "TransportOrder",
      entityId: dispute.orderId,
      link: actor.isAdmin ? `/orders/${dispute.orderId}?tab=dispute` : `/orders/${dispute.orderId}?tab=dispute`,
    });
    return c;
  });
}

/** Администратор: рассмотрение и закрытие спора. */
export async function updateDispute(actor: Actor, disputeId: string, input: z.output<typeof disputeUpdateSchema>) {
  if (!actor.permissions.has("ADMIN_DISPUTES")) throw errors.forbidden("Управлять спорами может только администратор.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Dispute" WHERE id = ${disputeId}::uuid FOR UPDATE`;
    const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw errors.notFound("Спор не найден.");
    if (dispute.status === "RESOLVED" || dispute.status === "REJECTED") throw new AppError("DUPLICATE_ACTION", "Спор уже закрыт.");
    const closing = input.status === "RESOLVED" || input.status === "REJECTED";
    if (closing && !input.resolution) throw errors.validation("Укажите решение по спору.", { resolution: ["Опишите решение"] });

    const updated = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: input.status,
        resolution: input.resolution ?? dispute.resolution,
        ...(closing ? { resolvedByUserId: actor.userId, resolvedAt: new Date() } : {}),
      },
    });
    if (closing) {
      const order = await tx.transportOrder.findUniqueOrThrow({ where: { id: dispute.orderId } });
      if (order.currentStatus === "DISPUTED") {
        const to =
          input.orderOutcome === "CANCEL"
            ? "CANCELLED"
            : input.orderOutcome === "CLOSE"
              ? "CLOSED"
              : (order.previousStatus ?? dispute.orderStatusBefore);
        await performTransitionInTx(tx, {
          orderId: order.id,
          to,
          side: "ADMIN",
          actor,
          source: "WEB",
          comment: `Спор ${input.status === "RESOLVED" ? "решён" : "отклонён"}: ${input.resolution}`,
        });
      }
      await audit(
        actor,
        {
          action: AuditAction.DISPUTE_RESOLVED,
          entityType: "TransportOrder",
          entityId: dispute.orderId,
          companyId: null,
          oldValue: { status: dispute.status },
          newValue: { status: input.status, resolution: input.resolution, orderOutcome: input.orderOutcome },
        },
        tx,
      );
    } else {
      await audit(
        actor,
        {
          action: AuditAction.DISPUTE_UPDATED,
          entityType: "TransportOrder",
          entityId: dispute.orderId,
          companyId: null,
          oldValue: { status: dispute.status },
          newValue: { status: input.status },
        },
        tx,
      );
    }
    const full = await tx.transportOrder.findUniqueOrThrow({ where: { id: dispute.orderId } });
    await notify(tx, {
      userIds: await orderParticipantUserIds(tx, full, { customer: true, carrier: true }),
      type: "DISPUTE_UPDATED",
      title: `${full.publicNumber}: спор — ${label("DisputeStatus", input.status).toLowerCase()}`,
      body: input.resolution ?? undefined,
      entityType: "TransportOrder",
      entityId: dispute.orderId,
      link: `/orders/${dispute.orderId}?tab=dispute`,
    });
    return updated;
  });
}

export async function listDisputes(actor: Actor, opts: { page: number; pageSize: number; status?: string }) {
  const base = actor.isAdmin ? {} : { order: ordersWhereForActor(actor) };
  const where = { ...base, ...(opts.status ? { status: opts.status as "OPEN" } : {}) };
  const [items, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
          },
        },
        _count: { select: { comments: true } },
      },
    }),
    prisma.dispute.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getDispute(actor: Actor, disputeId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      order: {
        select: {
          id: true,
          publicNumber: true,
          currentStatus: true,
          previousStatus: true,
          shipper: { select: { legalName: true } },
          carrier: { select: { legalName: true } },
        },
      },
    },
  });
  if (!dispute) throw errors.notFound("Спор не найден.");
  await requireOrderAccess(actor, dispute.orderId);
  const userIds = [dispute.openedByUserId, dispute.resolvedByUserId, ...dispute.comments.map((c) => c.authorUserId)].filter(
    Boolean,
  ) as string[];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, platformRole: true },
  });
  return {
    dispute,
    users: Object.fromEntries(
      users.map((u) => [u.id, { name: `${u.firstName} ${u.lastName}`, isAdmin: u.platformRole === "PLATFORM_ADMIN" }]),
    ),
  };
}
