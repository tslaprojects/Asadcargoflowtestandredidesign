import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requirePermission, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { ACTIVE_STATUSES, IN_TRANSIT_STATUSES } from "@/lib/state-machine/order-state-machine";
import { companyRatings } from "./company.service";
import { companyUserIds, notify } from "./notification.service";
import { performTransitionInTx } from "./order-core";

type Page = { page: number; pageSize: number };

export async function adminStats(actor: Actor) {
  requirePermission(actor, "ADMIN_ORDERS");
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const [
    users,
    companies,
    loads,
    orders,
    active,
    inTransit,
    completed,
    disputes,
    pendingVerification,
    bids,
    newCompanies,
    recentOrders,
    newDisputes,
    failedLogins,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.company.count({ where: { deletedAt: null } }),
    prisma.load.count({ where: { deletedAt: null } }),
    prisma.transportOrder.count(),
    prisma.transportOrder.count({ where: { currentStatus: { in: ACTIVE_STATUSES } } }),
    prisma.transportOrder.count({ where: { currentStatus: { in: IN_TRANSIT_STATUSES } } }),
    prisma.transportOrder.count({ where: { currentStatus: "CLOSED" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.company.count({ where: { verificationStatus: "PENDING" } }),
    prisma.bid.count(),
    prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, legalName: true, type: true, country: true, verificationStatus: true, createdAt: true },
    }),
    prisma.transportOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        publicNumber: true,
        currentStatus: true,
        agreedAmount: true,
        currency: true,
        createdAt: true,
        shipper: { select: { legalName: true } },
        carrier: { select: { legalName: true } },
      },
    }),
    prisma.dispute.findMany({
      where: { status: { in: ["OPEN", "IN_REVIEW"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { order: { select: { id: true, publicNumber: true } } },
    }),
    prisma.auditLog.groupBy({
      by: ["actorUserId"],
      where: { action: AuditAction.USER_LOGIN_FAILED, createdAt: { gte: dayAgo } },
      _count: { _all: true },
      orderBy: { _count: { actorUserId: "desc" } },
      take: 10,
    }),
  ]);
  const suspiciousUsers = await prisma.user.findMany({
    where: { id: { in: failedLogins.filter((f) => f.actorUserId && f._count._all >= 3).map((f) => f.actorUserId!) } },
    select: { id: true, email: true, firstName: true, lastName: true, status: true },
  });
  const suspicious = suspiciousUsers.map((u) => ({
    ...u,
    failedLogins: failedLogins.find((f) => f.actorUserId === u.id)?._count._all ?? 0,
  }));
  return {
    kpi: { users, companies, loads, orders, active, inTransit, completed, disputes, pendingVerification, bids },
    newCompanies,
    recentOrders,
    newDisputes,
    suspicious,
  };
}

// ─────────── Пользователи ───────────

export async function adminListUsers(actor: Actor, opts: Page & { q?: string; status?: string }) {
  requirePermission(actor, "ADMIN_USERS");
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(opts.status ? { status: opts.status as "ACTIVE" } : {}),
    ...(opts.q
      ? {
          OR: [
            { email: { contains: opts.q, mode: "insensitive" } },
            { firstName: { contains: opts.q, mode: "insensitive" } },
            { lastName: { contains: opts.q, mode: "insensitive" } },
            { phone: { contains: opts.q } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        platformRole: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: { select: { role: true, company: { select: { id: true, legalName: true } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function adminGetUser(actor: Actor, userId: string) {
  requirePermission(actor, "ADMIN_USERS");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      platformRole: true,
      lastLoginAt: true,
      createdAt: true,
      blockedAt: true,
      blockReason: true,
      memberships: { include: { company: { select: { id: true, legalName: true, type: true, verificationStatus: true } } } },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, ipAddress: true, userAgent: true, lastSeenAt: true, createdAt: true },
      },
    },
  });
  if (!user) throw errors.notFound("Пользователь не найден.");
  const activity = await prisma.auditLog.findMany({ where: { actorUserId: userId }, orderBy: { createdAt: "desc" }, take: 50 });
  return { user, activity };
}

export async function adminSetUserStatus(actor: Actor, userId: string, action: "BLOCK" | "UNBLOCK", reason: string | null) {
  requirePermission(actor, "ADMIN_USERS");
  if (userId === actor.userId) throw errors.forbidden("Нельзя заблокировать собственную учётную запись.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw errors.notFound("Пользователь не найден.");
  if (action === "BLOCK" && user.status === "BLOCKED") throw new AppError("DUPLICATE_ACTION", "Пользователь уже заблокирован.");
  if (action === "UNBLOCK" && user.status === "ACTIVE") throw new AppError("DUPLICATE_ACTION", "Пользователь уже активен.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data:
        action === "BLOCK"
          ? { status: "BLOCKED", blockedAt: new Date(), blockReason: reason }
          : { status: "ACTIVE", blockedAt: null, blockReason: null },
    });
    if (action === "BLOCK") await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(
      actor,
      {
        action: action === "BLOCK" ? AuditAction.USER_BLOCKED : AuditAction.USER_UNBLOCKED,
        entityType: "User",
        entityId: userId,
        companyId: null,
        oldValue: { status: user.status },
        newValue: { status: updated.status, reason },
      },
      tx,
    );
    return { id: updated.id, status: updated.status };
  });
}

// ─────────── Компании ───────────

export async function adminListCompanies(actor: Actor, opts: Page & { q?: string; type?: string; verification?: string }) {
  requirePermission(actor, "ADMIN_COMPANIES");
  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
    ...(opts.type ? { type: opts.type as "CARRIER" } : {}),
    ...(opts.verification ? { verificationStatus: opts.verification as "VERIFIED" } : {}),
    ...(opts.q
      ? {
          OR: [
            { legalName: { contains: opts.q, mode: "insensitive" } },
            { registrationNumber: { contains: opts.q, mode: "insensitive" } },
            { city: { contains: opts.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        _count: { select: { members: true, shipperOrders: true, carrierOrders: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);
  const ratings = await companyRatings(items.map((i) => i.id));
  return { items: items.map((c) => ({ ...c, rating: ratings[c.id] })), total, page: opts.page, pageSize: opts.pageSize };
}

/** Решение по верификации / приостановка / восстановление компании. */
export async function adminCompanyDecision(
  actor: Actor,
  companyId: string,
  decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES" | "SUSPEND" | "RESTORE",
  comment: string | null,
) {
  requirePermission(actor, "ADMIN_VERIFICATION");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw errors.notFound("Компания не найдена.");
  if ((decision === "REJECT" || decision === "REQUEST_CHANGES" || decision === "SUSPEND") && !comment) {
    throw errors.validation("Укажите комментарий для компании.", { comment: ["Обязательное поле"] });
  }
  return prisma.$transaction(async (tx) => {
    const pending = await tx.verificationRequest.findFirst({ where: { companyId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
    let status = company.verificationStatus;
    let action: (typeof AuditAction)[keyof typeof AuditAction];
    switch (decision) {
      case "APPROVE":
        if (company.verificationStatus === "SUSPENDED") {
          throw new AppError("INVALID_STATE_TRANSITION", "Компания приостановлена — сначала восстановите её деятельность.");
        }
        status = "VERIFIED";
        action = AuditAction.VERIFICATION_APPROVED;
        if (pending)
          await tx.verificationRequest.update({
            where: { id: pending.id },
            data: { status: "APPROVED", reviewerUserId: actor.userId, reviewComment: comment, reviewedAt: new Date() },
          });
        break;
      case "REJECT":
        status = "REJECTED";
        action = AuditAction.VERIFICATION_REJECTED;
        if (pending)
          await tx.verificationRequest.update({
            where: { id: pending.id },
            data: { status: "REJECTED", reviewerUserId: actor.userId, reviewComment: comment, reviewedAt: new Date() },
          });
        break;
      case "REQUEST_CHANGES":
        status = "UNVERIFIED";
        action = AuditAction.VERIFICATION_CHANGES_REQUESTED;
        if (pending)
          await tx.verificationRequest.update({
            where: { id: pending.id },
            data: { status: "CHANGES_REQUESTED", reviewerUserId: actor.userId, reviewComment: comment, reviewedAt: new Date() },
          });
        break;
      case "SUSPEND":
        if (company.verificationStatus === "SUSPENDED") throw new AppError("DUPLICATE_ACTION", "Компания уже приостановлена.");
        status = "SUSPENDED";
        action = AuditAction.COMPANY_SUSPENDED;
        break;
      case "RESTORE": {
        if (company.verificationStatus !== "SUSPENDED") throw new AppError("INVALID_STATE_TRANSITION", "Компания не приостановлена.");
        const lastApproved = await tx.verificationRequest.findFirst({ where: { companyId, status: "APPROVED" } });
        status = lastApproved ? "VERIFIED" : "UNVERIFIED";
        action = AuditAction.COMPANY_RESTORED;
        break;
      }
    }
    const updated = await tx.company.update({
      where: { id: companyId },
      data: {
        verificationStatus: status,
        ...(decision === "SUSPEND" ? { suspendedAt: new Date(), suspendReason: comment } : {}),
        ...(decision === "RESTORE" ? { suspendedAt: null, suspendReason: null } : {}),
      },
    });
    await audit(
      actor,
      {
        action,
        entityType: "Company",
        entityId: companyId,
        companyId,
        oldValue: { verificationStatus: company.verificationStatus },
        newValue: { verificationStatus: status, comment },
      },
      tx,
    );
    const titles = {
      APPROVE: "Компания прошла проверку",
      REJECT: "Проверка компании отклонена",
      REQUEST_CHANGES: "Требуются исправления для проверки",
      SUSPEND: "Деятельность компании приостановлена",
      RESTORE: "Деятельность компании восстановлена",
    } as const;
    await notify(tx, {
      userIds: await companyUserIds(tx, companyId),
      type: "VERIFICATION_UPDATED",
      title: titles[decision],
      body: comment ?? undefined,
      entityType: "Company",
      entityId: companyId,
      link: "/company?tab=verification",
    });
    return updated;
  });
}

export async function adminVerificationQueue(actor: Actor) {
  requirePermission(actor, "ADMIN_VERIFICATION");
  return prisma.verificationRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      company: {
        select: {
          id: true,
          legalName: true,
          type: true,
          country: true,
          city: true,
          registrationNumber: true,
          taxId: true,
          verificationStatus: true,
        },
      },
      documents: { where: { deletedAt: null } },
    },
  });
}

// ─────────── Грузы, заказы, документы, аудит ───────────

export async function adminListLoads(actor: Actor, opts: Page & { q?: string; status?: string }) {
  requirePermission(actor, "ADMIN_ORDERS");
  const where: Prisma.LoadWhereInput = {
    ...(opts.status ? { status: opts.status as "DRAFT" } : {}),
    ...(opts.q
      ? {
          OR: [
            { publicNumber: { contains: opts.q, mode: "insensitive" } },
            { title: { contains: opts.q, mode: "insensitive" } },
            { company: { legalName: { contains: opts.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.load.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { company: { select: { legalName: true } }, _count: { select: { bids: true } } },
    }),
    prisma.load.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function adminListDocuments(actor: Actor, opts: Page & { q?: string }) {
  requirePermission(actor, "ADMIN_ORDERS");
  const where: Prisma.OrderDocumentWhereInput = opts.q
    ? {
        OR: [
          { filename: { contains: opts.q, mode: "insensitive" } },
          { order: { publicNumber: { contains: opts.q, mode: "insensitive" } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.orderDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { order: { select: { id: true, publicNumber: true } } },
    }),
    prisma.orderDocument.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function adminListAudit(actor: Actor, opts: Page & { q?: string; action?: string; entityType?: string; userId?: string }) {
  requirePermission(actor, "ADMIN_AUDIT");
  const where: Prisma.AuditLogWhereInput = {
    ...(opts.action ? { action: opts.action } : {}),
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.userId ? { actorUserId: opts.userId } : {}),
    ...(opts.q
      ? { OR: [{ entityId: opts.q }, { actor: { email: { contains: opts.q, mode: "insensitive" } } }, { ipAddress: { contains: opts.q } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { actor: { select: { email: true, firstName: true, lastName: true } }, company: { select: { legalName: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

/** Администратор: приостановить / возобновить перевозку. */
export async function adminHoldOrder(actor: Actor, orderId: string, hold: boolean, comment: string | null) {
  requirePermission(actor, "ADMIN_ORDERS");
  return prisma.$transaction(async (tx) => {
    const order = await tx.transportOrder.findUnique({ where: { id: orderId } });
    if (!order) throw errors.notFound("Перевозка не найдена.");
    if (hold) {
      return (
        await performTransitionInTx(tx, {
          orderId,
          to: "ON_HOLD",
          side: "ADMIN",
          actor,
          source: "WEB",
          comment: comment ?? "Приостановлено администратором",
        })
      ).order;
    }
    if (order.currentStatus !== "ON_HOLD" || !order.previousStatus)
      throw new AppError("INVALID_STATE_TRANSITION", "Перевозка не приостановлена.");
    return (
      await performTransitionInTx(tx, {
        orderId,
        to: order.previousStatus as OrderStatus,
        side: "ADMIN",
        actor,
        source: "WEB",
        comment: comment ?? "Возобновлено администратором",
      })
    ).order;
  });
}
