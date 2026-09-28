import "server-only";
import type { z } from "zod";
import type { MemberRole } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor, RequestMeta } from "@/lib/auth/actor";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { createSession, destroySession, setActiveCompany } from "@/lib/auth/session";
import { generateToken, sha256 } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/notifications/adapters";
import { ROLES_BY_COMPANY_TYPE } from "@/lib/permissions";
import type { changePasswordSchema, loginSchema, profileUpdateSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";

const ROLE_BY_ACTIVITY: Record<"SHIPPER" | "CARRIER" | "FORWARDER", MemberRole> = {
  SHIPPER: "SHIPPER",
  CARRIER: "CARRIER_ADMIN",
  FORWARDER: "FORWARDER",
};

type RegisterInput = z.output<typeof registerSchema>;

/**
 * Демо-стенд (DEMO_SEED=1 в production) содержит общедоступные демо-аккаунты — регистрация реальных
 * пользователей там закрыта, чтобы их данные не оказались рядом с публичными учётными записями.
 */
export function registrationClosed() {
  return process.env.NODE_ENV === "production" && process.env.DEMO_SEED === "1" && process.env.ALLOW_PUBLIC_REGISTRATION !== "1";
}

export async function register(input: RegisterInput, meta: RequestMeta) {
  if (registrationClosed()) {
    throw errors.forbidden("Это демонстрационный стенд: регистрация новых пользователей отключена.");
  }
  enforceRateLimit("register", meta.ip ?? "anon");
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw errors.validation("Пользователь с таким email уже зарегистрирован.", {
      email: ["Пользователь с таким email уже зарегистрирован"],
    });
  }
  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      },
    });
    const actorLike = { userId: user.id, active: null, ip: meta.ip, userAgent: meta.userAgent };
    await audit(
      actorLike,
      { action: AuditAction.USER_REGISTERED, entityType: "User", entityId: user.id, newValue: { email: user.email } },
      tx,
    );

    let companyId: string;
    if (input.companyMode === "create") {
      const c = input.company!;
      const dup = await tx.company.findUnique({
        where: { country_registrationNumber: { country: c.country, registrationNumber: c.registrationNumber } },
      });
      if (dup) {
        throw errors.validation(
          "Компания с таким регистрационным номером уже зарегистрирована. Попросите приглашение у её администратора.",
          {
            "company.registrationNumber": ["Компания с таким номером уже существует"],
          },
        );
      }
      const company = await tx.company.create({
        data: {
          type: input.activity,
          legalName: c.legalName,
          tradeName: c.tradeName,
          registrationNumber: c.registrationNumber,
          taxId: c.taxId,
          country: c.country,
          region: c.region,
          city: c.city,
          address: c.address,
          postalCode: c.postalCode,
          phone: c.phone ?? input.phone,
          email: c.email ?? input.email,
          website: c.website,
          description: c.description,
        },
      });
      await tx.companyMember.create({
        data: { companyId: company.id, userId: user.id, role: ROLE_BY_ACTIVITY[input.activity] },
      });
      companyId = company.id;
      await audit(
        { ...actorLike, active: null },
        {
          action: AuditAction.COMPANY_CREATED,
          entityType: "Company",
          entityId: company.id,
          companyId: company.id,
          newValue: { legalName: company.legalName, type: company.type },
        },
        tx,
      );
    } else {
      companyId = await consumeInvite(tx, input.inviteToken!, user.id, user.email, meta);
    }
    return { user, companyId };
  });

  await createSession(result.user.id, result.companyId, meta);
  logger.info("auth.registered", { userId: result.user.id });
  return { userId: result.user.id, companyId: result.companyId };
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Принимает приглашение: создаёт членство (и связывает профиль водителя, если приглашали водителя). */
async function consumeInvite(tx: TxClient, token: string, userId: string, email: string, meta: RequestMeta) {
  const invite = await tx.companyInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { company: true } });
  if (!invite || invite.status !== "PENDING")
    throw errors.validation("Приглашение недействительно или уже использовано.", { inviteToken: ["Приглашение недействительно"] });
  if (invite.expiresAt < new Date()) {
    await tx.companyInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    throw errors.validation("Срок действия приглашения истёк. Попросите новое.", { inviteToken: ["Приглашение истекло"] });
  }
  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    throw errors.validation("Приглашение выписано на другой email.", { email: ["Используйте email, на который пришло приглашение"] });
  }
  const existing = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: invite.companyId, userId } } });
  if (existing) throw new AppError("DUPLICATE_ACTION", "Вы уже состоите в этой компании.");

  await tx.companyMember.create({ data: { companyId: invite.companyId, userId, role: invite.role } });
  if (invite.role === "DRIVER") {
    if (invite.driverProfileId) {
      await tx.driverProfile.update({ where: { id: invite.driverProfileId }, data: { userId } });
    } else {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.driverProfile.create({
        data: {
          userId,
          companyId: invite.companyId,
          fullName: `${user.firstName} ${user.lastName}`,
          phone: user.phone ?? "",
          licenseNumber: "—",
          licenseCategory: "CE",
        },
      });
    }
  }
  await tx.companyInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: userId },
  });
  await audit(
    { userId, active: null, ip: meta.ip, userAgent: meta.userAgent },
    {
      action: AuditAction.MEMBER_JOINED,
      entityType: "Company",
      entityId: invite.companyId,
      companyId: invite.companyId,
      newValue: { role: invite.role },
    },
    tx,
  );
  return invite.companyId;
}

export async function acceptInviteForExistingUser(actor: Actor, token: string) {
  const companyId = await prisma.$transaction((tx) =>
    consumeInvite(tx, token, actor.userId, actor.email, { ip: actor.ip, userAgent: actor.userAgent }),
  );
  if (actor.sessionId) await setActiveCompany(actor.sessionId, companyId);
  return { companyId };
}

export async function getInvitePreview(token: string) {
  const invite = await prisma.companyInvite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { company: { select: { legalName: true, type: true, city: true, country: true } } },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) return null;
  return { email: invite.email, role: invite.role, company: invite.company, expiresAt: invite.expiresAt };
}

export async function login(input: z.output<typeof loginSchema>, meta: RequestMeta) {
  enforceRateLimit("login", `${meta.ip ?? "anon"}:${input.email}`);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid || user.deletedAt) {
    if (user) {
      await audit(
        { userId: user.id, active: null, ip: meta.ip, userAgent: meta.userAgent },
        { action: AuditAction.USER_LOGIN_FAILED, entityType: "User", entityId: user.id },
      );
    }
    logger.warn("auth.login_failed", { ip: meta.ip });
    throw new AppError("UNAUTHORIZED", "Неверный email или пароль.");
  }
  if (user.status === "BLOCKED") {
    throw new AppError("FORBIDDEN", "Учётная запись заблокирована. Обратитесь в поддержку CargoFlow.");
  }
  const companyId = user.memberships[0]?.companyId ?? null;
  await createSession(user.id, companyId, meta);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(
    { userId: user.id, active: null, ip: meta.ip, userAgent: meta.userAgent },
    { action: AuditAction.USER_LOGIN, entityType: "User", entityId: user.id, companyId },
  );
  logger.info("auth.login", { userId: user.id });
  const membership = user.memberships[0];
  return {
    userId: user.id,
    role: membership?.role ?? null,
    isAdmin: user.platformRole === "PLATFORM_ADMIN",
    redirectTo: homePathFor(membership?.role ?? null, user.platformRole === "PLATFORM_ADMIN"),
  };
}

export function homePathFor(role: MemberRole | null, isAdmin: boolean): string {
  if (isAdmin && !role) return "/admin";
  if (role === "DRIVER") return "/driver";
  return "/dashboard";
}

export async function logout(actor: Actor | null) {
  if (actor) await audit(actor, { action: AuditAction.USER_LOGOUT, entityType: "User", entityId: actor.userId });
  await destroySession();
}

export async function requestPasswordReset(email: string, meta: RequestMeta) {
  enforceRateLimit("passwordReset", `${meta.ip ?? "anon"}:${email}`);
  const user = await prisma.user.findUnique({ where: { email } });
  // Ответ всегда одинаковый — не раскрываем, существует ли email
  if (!user || user.status === "BLOCKED" || user.deletedAt) return { ok: true };
  const token = generateToken(32);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
  });
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
  await sendEmail(user.email, "Сброс пароля CargoFlow", `Для установки нового пароля перейдите по ссылке (действует 1 час): ${link}`);
  await audit(
    { userId: user.id, active: null, ip: meta.ip, userAgent: meta.userAgent },
    { action: AuditAction.USER_PASSWORD_RESET_REQUESTED, entityType: "User", entityId: user.id },
  );
  return { ok: true };
}

export async function resetPassword(input: z.output<typeof resetPasswordSchema>, meta: RequestMeta) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw errors.validation("Ссылка для сброса пароля недействительна или устарела. Запросите новую.");
  }
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    const used = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new AppError("DUPLICATE_ACTION", "Ссылка уже использована.");
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // Завершаем все активные сессии пользователя
    await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(
      { userId: record.userId, active: null, ip: meta.ip, userAgent: meta.userAgent },
      { action: AuditAction.USER_PASSWORD_RESET, entityType: "User", entityId: record.userId },
      tx,
    );
  });
  return { ok: true };
}

export async function changePassword(actor: Actor, input: z.output<typeof changePasswordSchema>) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw errors.validation("Текущий пароль указан неверно.", { currentPassword: ["Неверный пароль"] });
  }
  await prisma.user.update({ where: { id: actor.userId }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await audit(actor, { action: AuditAction.USER_UPDATED, entityType: "User", entityId: actor.userId, newValue: { password: "changed" } });
  return { ok: true };
}

export async function updateProfile(actor: Actor, input: z.output<typeof profileUpdateSchema>) {
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { firstName: true, lastName: true, phone: true },
  });
  const user = await prisma.user.update({
    where: { id: actor.userId },
    data: input,
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
  await audit(actor, { action: AuditAction.USER_UPDATED, entityType: "User", entityId: actor.userId, oldValue: before, newValue: input });
  return user;
}

/** Повторная аутентификация перед критическим действием (подписание). */
export async function reauthenticate(actor: Actor, password: string) {
  enforceRateLimit("login", `reauth:${actor.userId}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("FORBIDDEN", "Неверный пароль. Подтверждение личности не пройдено.", {
      status: 403,
      fields: { password: ["Неверный пароль"] },
    });
  }
}

export async function switchCompany(actor: Actor, companyId: string) {
  if (!actor.memberships.some((m) => m.companyId === companyId)) throw errors.forbidden("Вы не состоите в этой компании.");
  if (!actor.sessionId) throw errors.unauthorized();
  await setActiveCompany(actor.sessionId, companyId);
  const m = actor.memberships.find((x) => x.companyId === companyId)!;
  return { companyId, redirectTo: homePathFor(m.role, actor.isAdmin) };
}

/** Проверка, что роль допустима для типа компании. */
export function assertRoleForCompany(companyType: keyof typeof ROLES_BY_COMPANY_TYPE, role: MemberRole) {
  if (!ROLES_BY_COMPANY_TYPE[companyType].includes(role)) {
    throw errors.validation("Эта роль недоступна для данного типа компании.", { role: ["Недопустимая роль"] });
  }
}
