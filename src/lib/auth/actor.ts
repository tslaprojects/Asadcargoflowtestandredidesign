import "server-only";
import type { CompanyType, MemberRole, PlatformRole, VerificationStatus } from "@/generated/prisma/enums";
import { currentDataMode, type DataMode } from "@/lib/db/data-mode";
import { prisma } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import { permissionsForRole, type Permission } from "@/lib/permissions";

export type ActorMembership = {
  id: string;
  companyId: string;
  role: MemberRole;
  company: {
    id: string;
    type: CompanyType;
    legalName: string;
    tradeName: string | null;
    verificationStatus: VerificationStatus;
  };
};

export type Actor = {
  sessionId: string | null;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  timezone: string;
  platformRole: PlatformRole;
  isAdmin: boolean;
  memberships: ActorMembership[];
  /** Активная компания (контекст работы пользователя). */
  active: ActorMembership | null;
  permissions: Set<Permission>;
  /** Режим данных сессии (из серверной сессии; не меняет права). */
  dataMode: DataMode;
  ip: string | null;
  userAgent: string | null;
};

export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  /** Нативное приложение CargoFlow (Windows, macOS, iOS, Android): сессия передаётся токеном, а не cookie. */
  native?: boolean;
};

const VIEW_ONLY = /_VIEW(_OWN)?$/;

export function permissionsForMembership(m: ActorMembership | null, isAdmin: boolean): Set<Permission> {
  if (isAdmin) return permissionsForRole(null, true);
  if (!m) return new Set();
  const perms = permissionsForRole(m.role);
  // Приостановленная компания — только просмотр
  if (m.company.verificationStatus === "SUSPENDED") {
    return new Set([...perms].filter((p) => VIEW_ONLY.test(p)));
  }
  return perms;
}

/**
 * Загружает пользователя с членствами и строит Actor.
 * Используется сессионным слоем, а также тестами/seed.
 */
export async function buildActor(
  userId: string,
  opts: { activeCompanyId?: string | null; sessionId?: string | null; meta?: RequestMeta } = {},
): Promise<Actor> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: { status: "ACTIVE", company: { deletedAt: null } },
        orderBy: { createdAt: "asc" },
        include: {
          company: { select: { id: true, type: true, legalName: true, tradeName: true, verificationStatus: true } },
        },
      },
    },
  });
  if (!user || user.deletedAt) throw errors.unauthorized();
  if (user.status === "BLOCKED") throw errors.forbidden("Ваша учётная запись заблокирована. Обратитесь в поддержку.");

  const memberships: ActorMembership[] = user.memberships.map((m) => ({
    id: m.id,
    companyId: m.companyId,
    role: m.role,
    company: m.company,
  }));
  const active = memberships.find((m) => m.companyId === opts.activeCompanyId) ?? memberships[0] ?? null;
  const isAdmin = user.platformRole === "PLATFORM_ADMIN";

  return {
    sessionId: opts.sessionId ?? null,
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    phone: user.phone,
    timezone: user.timezone,
    platformRole: user.platformRole,
    isAdmin,
    memberships,
    active,
    permissions: permissionsForMembership(active, isAdmin),
    dataMode: currentDataMode() ?? "real",
    ip: opts.meta?.ip ?? null,
    userAgent: opts.meta?.userAgent ?? null,
  };
}

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function requirePermission(actor: Actor, permission: Permission, message?: string) {
  if (!can(actor, permission)) throw errors.forbidden(message);
}

/** Членство пользователя в конкретной компании (не обязательно активной). */
export function membershipIn(actor: Actor, companyId: string | null | undefined): ActorMembership | null {
  if (!companyId) return null;
  return actor.memberships.find((m) => m.companyId === companyId) ?? null;
}

/**
 * Права пользователя в конкретной компании (по его роли именно в ней, с учётом приостановки компании).
 * Для операций над объектом компании права берутся отсюда, а не из активной компании:
 * у пользователя может быть несколько компаний с разными ролями.
 */
export function permissionsInCompany(actor: Actor, companyId: string | null | undefined): Set<Permission> {
  if (actor.isAdmin) return permissionsForMembership(null, true);
  return permissionsForMembership(membershipIn(actor, companyId), false);
}

export function requireCompanyPermission(actor: Actor, companyId: string | null | undefined, permission: Permission, message?: string) {
  if (!permissionsInCompany(actor, companyId).has(permission)) throw errors.forbidden(message);
}

/** Требует активную компанию (контекст работы). */
export function requireActiveCompany(actor: Actor): ActorMembership {
  if (!actor.active) throw errors.forbidden("Сначала создайте компанию или присоединитесь к существующей.");
  return actor.active;
}

/** Серверное представление актора для передачи в клиентские компоненты (без Set). */
export type ClientActor = Omit<Actor, "permissions" | "ip" | "userAgent" | "sessionId"> & { permissions: Permission[] };

export function toClientActor(actor: Actor): ClientActor {
  return {
    userId: actor.userId,
    email: actor.email,
    firstName: actor.firstName,
    lastName: actor.lastName,
    fullName: actor.fullName,
    phone: actor.phone,
    timezone: actor.timezone,
    platformRole: actor.platformRole,
    isAdmin: actor.isAdmin,
    memberships: actor.memberships,
    active: actor.active,
    permissions: [...actor.permissions],
    dataMode: actor.dataMode,
  };
}
