import "server-only";
import type { z } from "zod";
import type { MemberRole } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor, RequestMeta } from "@/lib/auth/actor";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { createSession, destroySession, setActiveCompany } from "@/lib/auth/session";
import { generateToken, sha256 } from "@/lib/auth/tokens";
import { runWithDataMode, type DataMode } from "@/lib/db/data-mode";
import { authDb, dbFor, prisma } from "@/lib/db/prisma";
import { demoWorkspaceReady, provisionDemoIdentity } from "./demo-workspace.service";
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

/** Identity (пользователи, пароли, сессии, приглашения) — всегда реальная база, независимо от режима текущей сессии. */
const inReal = <T>(fn: () => Promise<T>) => runWithDataMode("real", fn);

/**
 * Демо-стенд (DEMO_SEED=1 в production) содержит общедоступные демо-аккаунты — регистрация реальных
 * пользователей там закрыта, чтобы их данные не оказались рядом с публичными учётными записями.
 */
export function registrationClosed() {
  return process.env.NODE_ENV === "production" && process.env.DEMO_SEED === "1" && process.env.ALLOW_PUBLIC_REGISTRATION !== "1";
}

export async function register(input: RegisterInput, meta: RequestMeta) {
  return inReal(async () => {
    if (registrationClosed()) {
      throw errors.forbidden("Это демонстрационный стенд: регистрация новых пользователей отключена.");
    }
    enforceRateLimit("register", meta.ip ?? "anon");
    if (process.env.NODE_ENV === "production" && input.email.endsWith("@cargoflow.demo")) {
      // Домен демо-аккаунтов зарезервирован: такие пользователи считаются демо и могут быть удалены при загрузке демо-данных
      throw errors.validation("Этот email-домен зарезервирован.", { email: ["Используйте рабочий email"] });
    }
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw errors.validation("Пользователь с таким email уже зарегистрирован.", {
        email: ["Пользователь с таким email уже зарегистрирован"],
      });
    }
    if (input.companyMode === "invite" && input.inviteToken) await expireInviteIfNeeded(input.inviteToken);
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
  });
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Просроченное приглашение помечается EXPIRED вне транзакции принятия (иначе статус откатится вместе с ошибкой). */
async function expireInviteIfNeeded(token: string) {
  await prisma.companyInvite.updateMany({
    where: { tokenHash: sha256(token), status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

/** Принимает приглашение: создаёт членство (и связывает профиль водителя, если приглашали водителя). */
async function consumeInvite(tx: TxClient, token: string, userId: string, email: string, meta: RequestMeta) {
  const invite = await tx.companyInvite.findUnique({ where: { tokenHash: sha256(token) }, include: { company: true } });
  if (invite?.status === "EXPIRED" || (invite && invite.status === "PENDING" && invite.expiresAt < new Date())) {
    throw errors.validation("Срок действия приглашения истёк. Попросите новое.", { inviteToken: ["Приглашение истекло"] });
  }
  if (!invite || invite.status !== "PENDING")
    throw errors.validation("Приглашение недействительно или уже использовано.", { inviteToken: ["Приглашение недействительно"] });
  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    throw errors.validation("Приглашение выписано на другой email.", { email: ["Используйте email, на который пришло приглашение"] });
  }
  const existing = await tx.companyMember.findUnique({ where: { companyId_userId: { companyId: invite.companyId, userId } } });
  if (existing) throw new AppError("DUPLICATE_ACTION", "Вы уже состоите в этой компании.");

  await tx.companyMember.create({ data: { companyId: invite.companyId, userId, role: invite.role } });
  if (invite.role === "DRIVER") {
    if (invite.driverProfileId) {
      // Привязываем только свободный профиль водителя той же компании
      const linked = await tx.driverProfile.updateMany({
        where: { id: invite.driverProfileId, companyId: invite.companyId, userId: null, deletedAt: null },
        data: { userId },
      });
      if (linked.count !== 1) {
        throw errors.validation("Профиль водителя из приглашения недоступен. Попросите новое приглашение.", {
          inviteToken: ["Приглашение недействительно"],
        });
      }
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
  return inReal(async () => {
    await expireInviteIfNeeded(token);
    const companyId = await prisma.$transaction((tx) =>
      consumeInvite(tx, token, actor.userId, actor.email, { ip: actor.ip, userAgent: actor.userAgent }),
    );
    if (actor.sessionId) await setActiveCompany(actor.sessionId, companyId);
    return { companyId };
  });
}

export async function getInvitePreview(token: string) {
  return inReal(async () => {
    const invite = await prisma.companyInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { company: { select: { legalName: true, type: true, city: true, country: true } } },
    });
    if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) return null;
    return { email: invite.email, role: invite.role, company: invite.company, expiresAt: invite.expiresAt };
  });
}

export async function login(input: z.output<typeof loginSchema>, meta: RequestMeta) {
  return inReal(async () => {
    enforceRateLimit("login", meta.ip ?? "anon");
    enforceRateLimit("loginAccount", input.email);
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
    // Режим выбран пользователем при входе и проверяется сервером; дальше он хранится только в серверной сессии.
    const dataMode: DataMode = input.dataMode;
    let companyId: string | null = user.memberships[0]?.companyId ?? null;
    let role: MemberRole | null = user.memberships[0]?.role ?? null;
    if (dataMode === "demo") {
      if (!(await demoWorkspaceReady())) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Демо-база ещё не готова (идёт загрузка демо-данных). Попробуйте через несколько минут.",
          {
            status: 503,
          },
        );
      }
      ({ activeCompanyId: companyId, role } = await provisionDemoIdentity(user.id));
    }
    await createSession(user.id, companyId, meta, dataMode);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(
      { userId: user.id, active: null, ip: meta.ip, userAgent: meta.userAgent },
      { action: AuditAction.USER_LOGIN, entityType: "User", entityId: user.id, newValue: { dataMode } },
    );
    logger.info("auth.login", { userId: user.id });
    return {
      userId: user.id,
      role,
      isAdmin: user.platformRole === "PLATFORM_ADMIN",
      redirectTo: homePathFor(role, user.platformRole === "PLATFORM_ADMIN"),
      dataMode,
    };
  });
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
  return inReal(async () => {
    enforceRateLimit("passwordReset", meta.ip ?? "anon");
    enforceRateLimit("passwordResetAccount", email);
    const user = await prisma.user.findUnique({ where: { email } });
    // Ответ всегда одинаковый — не раскрываем, существует ли email
    if (!user || user.status === "BLOCKED" || user.deletedAt) return { ok: true };
    const token = generateToken(32);
    await prisma.$transaction([
      // Действует только последняя ссылка: прежние неиспользованные токены аннулируются
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
      }),
    ]);
    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    await sendEmail(user.email, "Сброс пароля CargoFlow", `Для установки нового пароля перейдите по ссылке (действует 1 час): ${link}`);
    await audit(
      { userId: user.id, active: null, ip: meta.ip, userAgent: meta.userAgent },
      { action: AuditAction.USER_PASSWORD_RESET_REQUESTED, entityType: "User", entityId: user.id },
    );
    return { ok: true };
  });
}

export async function resetPassword(input: z.output<typeof resetPasswordSchema>, meta: RequestMeta) {
  return inReal(async () => {
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
  });
}

export async function changePassword(actor: Actor, input: z.output<typeof changePasswordSchema>) {
  return inReal(async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw errors.validation("Текущий пароль указан неверно.", { currentPassword: ["Неверный пароль"] });
    }
    const passwordHash = await hashPassword(input.newPassword);
    const revoked = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { passwordHash } });
      // Все остальные сессии завершаются: если пароль меняют из-за утечки, чужой вход должен прекратиться
      const r = await tx.session.updateMany({
        where: { userId: actor.userId, revokedAt: null, ...(actor.sessionId ? { id: { not: actor.sessionId } } : {}) },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({ where: { userId: actor.userId, usedAt: null }, data: { usedAt: new Date() } });
      await audit(
        actor,
        {
          action: AuditAction.USER_UPDATED,
          entityType: "User",
          entityId: actor.userId,
          newValue: { password: "changed", sessionsRevoked: r.count },
        },
        tx,
      );
      return r.count;
    });
    return { ok: true, sessionsRevoked: revoked };
  });
}

export async function updateProfile(actor: Actor, input: z.output<typeof profileUpdateSchema>) {
  // Профиль — часть identity: меняется в реальной базе; в демо-режиме синхронно обновляется и зеркальная запись.
  const user = await inReal(async () => {
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, phone: true },
    });
    const updated = await prisma.user.update({
      where: { id: actor.userId },
      data: input,
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    await audit(actor, { action: AuditAction.USER_UPDATED, entityType: "User", entityId: actor.userId, oldValue: before, newValue: input });
    return updated;
  });
  if (actor.dataMode === "demo") await dbFor("demo").user.updateMany({ where: { id: actor.userId }, data: input });
  return user;
}

/** Повторная аутентификация перед критическим действием (подписание). */
export async function reauthenticate(actor: Actor, password: string) {
  enforceRateLimit("loginAccount", `reauth:${actor.userId}`);
  // Пароль — часть identity: проверяется по реальной базе. Демо-персонажи seed существуют только в демо-базе
  // (войти ими нельзя: вход проверяет реальную identity), поэтому для них — пароль из демо-базы.
  const identity = await authDb.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
  const persona =
    !identity && actor.dataMode === "demo"
      ? await dbFor("demo").user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } })
      : null;
  const hash = identity?.passwordHash ?? persona?.passwordHash ?? DUMMY_PASSWORD_HASH;
  if (!(await verifyPassword(password, hash)) || (!identity && !persona)) {
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

/**
 * Переключение режима данных уже вошедшего пользователя.
 * Identity та же; сервер создаёт новую сессию с новым режимом (ротация токена) и отзывает текущую.
 */
export async function switchDataMode(actor: Actor, dataMode: DataMode, meta: RequestMeta) {
  return inReal(async () => {
    const realMemberships = await prisma.companyMember.findMany({
      where: { userId: actor.userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    let role: MemberRole | null = realMemberships[0]?.role ?? null;
    if (dataMode === actor.dataMode) return { dataMode, redirectTo: homePathFor(actor.active?.role ?? role, actor.isAdmin) };
    let companyId: string | null = realMemberships[0]?.companyId ?? null;
    if (dataMode === "demo") {
      if (!(await demoWorkspaceReady())) {
        throw new AppError(
          "SERVICE_UNAVAILABLE",
          "Демо-база ещё не готова (идёт загрузка демо-данных). Попробуйте через несколько минут.",
          {
            status: 503,
          },
        );
      }
      ({ activeCompanyId: companyId, role } = await provisionDemoIdentity(actor.userId));
    }
    await destroySession();
    await createSession(actor.userId, companyId, meta, dataMode);
    await audit(
      { userId: actor.userId, active: null, ip: meta.ip, userAgent: meta.userAgent },
      { action: AuditAction.USER_LOGIN, entityType: "User", entityId: actor.userId, newValue: { dataMode, switchedFrom: actor.dataMode } },
    );
    return { dataMode, redirectTo: homePathFor(role, actor.isAdmin) };
  });
}

/** Проверка, что роль допустима для типа компании. */
export function assertRoleForCompany(companyType: keyof typeof ROLES_BY_COMPANY_TYPE, role: MemberRole) {
  if (!ROLES_BY_COMPANY_TYPE[companyType].includes(role)) {
    throw errors.validation("Эта роль недоступна для данного типа компании.", { role: ["Недопустимая роль"] });
  }
}
