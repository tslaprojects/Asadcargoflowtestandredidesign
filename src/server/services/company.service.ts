import "server-only";
import type { z } from "zod";
import type { CompanyDocumentType } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requireActiveCompany, requireCompanyPermission, requirePermission, type Actor } from "@/lib/auth/actor";
import { generateToken, sha256 } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { sendEmail } from "@/lib/notifications/adapters";
import { ROLES_BY_COMPANY_TYPE } from "@/lib/permissions";
import { buildStorageKey, storage } from "@/lib/storage/storage";
import { validateUpload } from "@/lib/storage/file-validation";
import type { companyUpdateSchema, inviteSchema, memberUpdateSchema } from "@/lib/validation/company";
import { notify } from "./notification.service";

export type RatingInfo = {
  average: number | null;
  count: number;
  punctuality: number | null;
  communication: number | null;
  documentation: number | null;
};

/** Агрегированный рейтинг компаний. */
export async function companyRatings(companyIds: string[]): Promise<Record<string, RatingInfo>> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const rows = await prisma.review.groupBy({
    by: ["toCompanyId"],
    where: { toCompanyId: { in: ids } },
    _avg: { rating: true, punctuality: true, communication: true, documentation: true },
    _count: { _all: true },
  });
  const r = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  const out: Record<string, RatingInfo> = {};
  for (const id of ids) out[id] = { average: null, count: 0, punctuality: null, communication: null, documentation: null };
  for (const row of rows) {
    out[row.toCompanyId] = {
      average: r(row._avg.rating),
      count: row._count._all,
      punctuality: r(row._avg.punctuality),
      communication: r(row._avg.communication),
      documentation: r(row._avg.documentation),
    };
  }
  return out;
}

function assertCompanyAccess(actor: Actor, companyId: string) {
  if (actor.isAdmin) return;
  if (!actor.memberships.some((m) => m.companyId === companyId)) throw errors.forbidden("У вас нет доступа к этой компании.");
}

function assertCompanyManager(actor: Actor, companyId: string) {
  if (actor.isAdmin) return;
  const m = actor.memberships.find((x) => x.companyId === companyId);
  if (!m) throw errors.forbidden("У вас нет доступа к этой компании.");
  if (m.role !== "SHIPPER" && m.role !== "FORWARDER" && m.role !== "CARRIER_ADMIN") {
    throw errors.forbidden("Изменять настройки компании может только её руководитель.");
  }
}

/** Полный профиль компании для её сотрудников и администратора. */
export async function getCompanyProfile(actor: Actor, companyId: string) {
  assertCompanyAccess(actor, companyId);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, lastLoginAt: true } },
        },
      },
      invites: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      verificationRequests: { orderBy: { createdAt: "desc" }, include: { documents: { where: { deletedAt: null } } } },
      _count: { select: { vehicles: { where: { deletedAt: null } }, drivers: { where: { deletedAt: null } }, loads: true } },
    },
  });
  if (!company) throw errors.notFound("Компания не найдена.");
  const [ratings, history, ordersCount] = await Promise.all([
    companyRatings([companyId]),
    prisma.auditLog.findMany({
      where: { companyId, entityType: { in: ["Company", "VerificationRequest"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { firstName: true, lastName: true } } },
    }),
    prisma.transportOrder.count({
      where: { OR: [{ shipperCompanyId: companyId }, { carrierCompanyId: companyId }, { forwarderCompanyId: companyId }] },
    }),
  ]);
  return { company, rating: ratings[companyId], history, ordersCount };
}

/** Публичная карточка компании (для контрагентов). */
export async function getPublicCompany(companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    select: {
      id: true,
      type: true,
      legalName: true,
      tradeName: true,
      country: true,
      city: true,
      website: true,
      description: true,
      verificationStatus: true,
      createdAt: true,
      _count: { select: { vehicles: { where: { deletedAt: null } } } },
    },
  });
  if (!company) throw errors.notFound("Компания не найдена.");
  const [ratings, reviews, completed] = await Promise.all([
    companyRatings([companyId]),
    prisma.review.findMany({
      where: { toCompanyId: companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { fromCompany: { select: { legalName: true } }, order: { select: { publicNumber: true } } },
    }),
    prisma.transportOrder.count({
      where: { currentStatus: "CLOSED", OR: [{ carrierCompanyId: companyId }, { shipperCompanyId: companyId }] },
    }),
  ]);
  return { company, rating: ratings[companyId], reviews, completed };
}

export async function updateCompany(actor: Actor, companyId: string, input: z.output<typeof companyUpdateSchema>) {
  requireCompanyPermission(actor, companyId, "COMPANY_MANAGE", "Изменять данные компании может только её руководитель.");
  assertCompanyManager(actor, companyId);
  const before = await prisma.company.findUnique({ where: { id: companyId } });
  if (!before) throw errors.notFound("Компания не найдена.");
  const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({ where: { id: companyId }, data });
    const oldValue = Object.fromEntries(Object.keys(data).map((k) => [k, (before as Record<string, unknown>)[k]]));
    await audit(
      actor,
      { action: AuditAction.COMPANY_UPDATED, entityType: "Company", entityId: companyId, companyId, oldValue, newValue: data },
      tx,
    );
    return company;
  });
}

// ─────────── Сотрудники и приглашения ───────────

export async function inviteMember(actor: Actor, companyId: string, input: z.output<typeof inviteSchema>) {
  const isDriverInvite = input.role === "DRIVER";
  // Права — по роли пользователя именно в этой компании (а не в активной)
  if (isDriverInvite)
    requireCompanyPermission(actor, companyId, "DRIVER_MANAGE", "Приглашать водителей может руководитель или диспетчер перевозчика.");
  else {
    requireCompanyPermission(actor, companyId, "COMPANY_MEMBERS_MANAGE", "Приглашать сотрудников может только руководитель компании.");
    assertCompanyManager(actor, companyId);
  }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  if (!ROLES_BY_COMPANY_TYPE[company.type].includes(input.role)) {
    throw errors.validation("Эта роль недоступна для данного типа компании.", { role: ["Недопустимая роль"] });
  }
  if (input.driverProfileId) {
    // Профиль водителя должен принадлежать этой компании и ещё не иметь учётной записи
    if (!isDriverInvite) throw errors.validation("Профиль водителя указывается только для приглашения водителя.");
    const profile = await prisma.driverProfile.findFirst({
      where: { id: input.driverProfileId, companyId, deletedAt: null },
      select: { userId: true },
    });
    if (!profile) throw errors.notFound("Водитель не найден в этой компании.");
    if (profile.userId) throw new AppError("DUPLICATE_ACTION", "У водителя уже есть доступ к приложению.");
  }
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { where: { companyId } } },
  });
  if (existingUser?.memberships.length) throw new AppError("DUPLICATE_ACTION", "Этот пользователь уже состоит в компании.");

  const token = generateToken(24);
  const invite = await prisma.$transaction(async (tx) => {
    await tx.companyInvite.updateMany({
      where: { companyId, email: input.email, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    const inv = await tx.companyInvite.create({
      data: {
        companyId,
        email: input.email,
        role: input.role,
        tokenHash: sha256(token),
        invitedByUserId: actor.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        driverProfileId: input.driverProfileId ?? null,
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.MEMBER_INVITED,
        entityType: "Company",
        entityId: companyId,
        companyId,
        newValue: { email: input.email, role: input.role },
      },
      tx,
    );
    if (existingUser) {
      await notify(tx, {
        userIds: [existingUser.id],
        type: "SYSTEM",
        title: `Приглашение в компанию ${company.legalName}`,
        body: "Откройте ссылку, чтобы присоединиться.",
        link: `/invite/${token}`,
      });
    }
    return inv;
  });
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  await sendEmail(
    input.email,
    `Приглашение в ${company.legalName} на CargoFlow`,
    `Вас пригласили в компанию ${company.legalName}. Перейдите по ссылке: ${link}`,
  );
  // Ссылка возвращается один раз — в БД хранится только hash токена
  return { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, link, token };
}

export async function revokeInvite(actor: Actor, inviteId: string) {
  const invite = await prisma.companyInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw errors.notFound("Приглашение не найдено.");
  requireCompanyPermission(actor, invite.companyId, invite.role === "DRIVER" ? "DRIVER_MANAGE" : "COMPANY_MEMBERS_MANAGE");
  if (invite.status !== "PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Отозвать можно только действующее приглашение.");
  return prisma.companyInvite.update({ where: { id: inviteId }, data: { status: "REVOKED" } });
}

export async function updateMember(actor: Actor, memberId: string, input: z.output<typeof memberUpdateSchema>) {
  const member = await prisma.companyMember.findUnique({ where: { id: memberId }, include: { company: true } });
  if (!member) throw errors.notFound("Сотрудник не найден.");
  requireCompanyPermission(actor, member.companyId, "COMPANY_MEMBERS_MANAGE", "Управлять сотрудниками может только руководитель компании.");
  assertCompanyManager(actor, member.companyId);
  if (member.userId === actor.userId) throw errors.forbidden("Нельзя изменить собственные права.");
  if (input.role && !ROLES_BY_COMPANY_TYPE[member.company.type].includes(input.role)) {
    throw errors.validation("Эта роль недоступна для данного типа компании.");
  }
  // Нельзя оставить компанию без руководителя
  if (member.role === "CARRIER_ADMIN" && ((input.role && input.role !== "CARRIER_ADMIN") || input.status === "DISABLED")) {
    const admins = await prisma.companyMember.count({ where: { companyId: member.companyId, role: "CARRIER_ADMIN", status: "ACTIVE" } });
    if (admins <= 1) throw errors.forbidden("В компании должен остаться хотя бы один руководитель.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.companyMember.update({ where: { id: memberId }, data: input });
    await audit(
      actor,
      {
        action: AuditAction.MEMBER_UPDATED,
        entityType: "Company",
        entityId: member.companyId,
        companyId: member.companyId,
        oldValue: { role: member.role, status: member.status },
        newValue: input,
      },
      tx,
    );
    return updated;
  });
}

// ─────────── Документы компании и верификация ───────────

export async function uploadCompanyDocument(actor: Actor, companyId: string, type: CompanyDocumentType, file: File) {
  requireCompanyPermission(actor, companyId, "COMPANY_MANAGE", "Загружать документы компании может только её руководитель.");
  assertCompanyManager(actor, companyId);
  const v = await validateUpload(file);
  const key = buildStorageKey(`companies/${companyId}`, v.ext);
  await storage().put(key, v.buffer, v.mimeType);
  return prisma.$transaction(async (tx) => {
    const doc = await tx.companyDocument.create({
      data: { companyId, uploadedByUserId: actor.userId, type, filename: v.filename, mimeType: v.mimeType, size: v.size, storageKey: key },
    });
    await audit(
      actor,
      {
        action: AuditAction.DOCUMENT_UPLOADED,
        entityType: "Company",
        entityId: companyId,
        companyId,
        newValue: { documentId: doc.id, type, filename: v.filename },
      },
      tx,
    );
    return doc;
  });
}

export async function getCompanyDocumentFile(actor: Actor, documentId: string) {
  const doc = await prisma.companyDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) throw errors.notFound("Документ не найден.");
  assertCompanyAccess(actor, doc.companyId);
  return doc;
}

export async function submitVerification(actor: Actor, companyId: string, comment: string | null) {
  requireCompanyPermission(actor, companyId, "COMPANY_MANAGE", "Отправить компанию на проверку может только её руководитель.");
  assertCompanyManager(actor, companyId);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  if (company.verificationStatus === "VERIFIED") throw new AppError("DUPLICATE_ACTION", "Компания уже проверена.");
  if (company.verificationStatus === "PENDING") throw new AppError("DUPLICATE_ACTION", "Заявка на проверку уже отправлена.");
  if (company.verificationStatus === "SUSPENDED")
    throw errors.forbidden("Деятельность компании приостановлена. Обратитесь к администратору.");
  const docs = await prisma.companyDocument.findMany({ where: { companyId, deletedAt: null, verificationRequestId: null } });
  const allDocs = await prisma.companyDocument.count({ where: { companyId, deletedAt: null } });
  if (allDocs === 0) {
    throw errors.validation("Загрузите хотя бы один документ (регистрационный или налоговый) перед отправкой на проверку.");
  }
  return prisma.$transaction(async (tx) => {
    const req = await tx.verificationRequest.create({
      data: { companyId, submittedByUserId: actor.userId, comment, documents: { connect: docs.map((d) => ({ id: d.id })) } },
    });
    await tx.company.update({ where: { id: companyId }, data: { verificationStatus: "PENDING" } });
    await audit(
      actor,
      {
        action: AuditAction.VERIFICATION_SUBMITTED,
        entityType: "VerificationRequest",
        entityId: req.id,
        companyId,
        newValue: { documents: allDocs },
      },
      tx,
    );
    const admins = await tx.user.findMany({ where: { platformRole: "PLATFORM_ADMIN", status: "ACTIVE" }, select: { id: true } });
    await notify(tx, {
      userIds: admins.map((a) => a.id),
      type: "VERIFICATION_UPDATED",
      title: `Заявка на проверку: ${company.legalName}`,
      entityType: "Company",
      entityId: companyId,
      link: `/admin/verification`,
    });
    return req;
  });
}

// ─────────── Каталог перевозчиков ───────────

export async function listCarriers(actor: Actor, opts: { q?: string; verifiedOnly?: boolean; page: number; pageSize: number }) {
  requirePermission(actor, "CARRIER_DIRECTORY_VIEW", "Каталог перевозчиков доступен заказчикам и экспедиторам.");
  const where = {
    type: "CARRIER" as const,
    deletedAt: null,
    verificationStatus: opts.verifiedOnly ? ("VERIFIED" as const) : { not: "SUSPENDED" as const },
    ...(opts.q
      ? {
          OR: [
            { legalName: { contains: opts.q, mode: "insensitive" as const } },
            { city: { contains: opts.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ verificationStatus: "asc" }, { legalName: "asc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        legalName: true,
        country: true,
        city: true,
        verificationStatus: true,
        _count: { select: { vehicles: { where: { deletedAt: null } }, carrierOrders: { where: { currentStatus: "CLOSED" } } } },
      },
    }),
    prisma.company.count({ where }),
  ]);
  const ratings = await companyRatings(items.map((i) => i.id));
  return { items: items.map((i) => ({ ...i, rating: ratings[i.id] })), total, page: opts.page, pageSize: opts.pageSize };
}

export function activeCompanyId(actor: Actor) {
  return requireActiveCompany(actor).companyId;
}

/** Создание компании существующим пользователем (вторая компания или после отключения). */
export async function createCompanyForActor(
  actor: Actor,
  input: import("zod").output<typeof import("@/lib/validation/auth").companyCreateSchema>,
) {
  const dup = await prisma.company.findUnique({
    where: { country_registrationNumber: { country: input.country, registrationNumber: input.registrationNumber } },
  });
  if (dup) {
    throw errors.validation("Компания с таким регистрационным номером уже зарегистрирована. Попросите приглашение у её администратора.", {
      registrationNumber: ["Компания с таким номером уже существует"],
    });
  }
  const role = input.type === "CARRIER" ? "CARRIER_ADMIN" : input.type === "FORWARDER" ? "FORWARDER" : "SHIPPER";
  const company = await prisma.$transaction(async (tx) => {
    const c = await tx.company.create({ data: { ...input, phone: input.phone ?? actor.phone, email: input.email ?? actor.email } });
    await tx.companyMember.create({ data: { companyId: c.id, userId: actor.userId, role } });
    await audit(
      actor,
      {
        action: AuditAction.COMPANY_CREATED,
        entityType: "Company",
        entityId: c.id,
        companyId: c.id,
        newValue: { legalName: c.legalName, type: c.type },
      },
      tx,
    );
    return c;
  });
  if (actor.sessionId) await prisma.session.update({ where: { id: actor.sessionId }, data: { activeCompanyId: company.id } });
  return company;
}
