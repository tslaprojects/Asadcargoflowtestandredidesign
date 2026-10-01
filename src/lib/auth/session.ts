import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { bindRenderDataMode, runWithDataMode, type DataMode } from "@/lib/db/data-mode";
import { authDb } from "@/lib/db/prisma";
import { errors, isAppError } from "@/lib/errors";
import type { DataMode as DbDataMode } from "@/generated/prisma/enums";
import { buildActor, permissionsForMembership, type Actor, type RequestMeta } from "./actor";
import { generateToken, sha256 } from "./tokens";

export const SESSION_COOKIE = "cf_session";

function ttlMs() {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 14);
  return (Number.isFinite(days) && days > 0 ? days : 14) * 24 * 60 * 60 * 1000;
}

/**
 * Флаг Secure у cookie сессии: в production — всегда, кроме явного локального запуска по http
 * (APP_URL=http://localhost…). Незаданный APP_URL больше не отключает Secure.
 */
export function secureCookies(env: { NODE_ENV?: string; APP_URL?: string } = process.env) {
  if (env.NODE_ENV !== "production") return false;
  return !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(env.APP_URL ?? "");
}

/**
 * IP клиента из X-Forwarded-For с учётом числа доверенных прокси (TRUSTED_PROXY_HOPS, по умолчанию 1).
 * Левые элементы заголовка задаёт сам клиент — им верить нельзя (подмена IP обходит rate limit).
 * Доверенный прокси дописывает адрес клиента справа, поэтому берётся N-й элемент с конца.
 */
export function clientIpFrom(forwarded: string | null, realIp: string | null, hopsEnv = process.env.TRUSTED_PROXY_HOPS): string | null {
  const hops = Number.isInteger(Number(hopsEnv)) && Number(hopsEnv) >= 0 ? Number(hopsEnv) : 1;
  if (hops === 0) return realIp?.trim() || null;
  const list = (forwarded ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length >= hops) return list[list.length - hops];
  return realIp?.trim() || list[0] || null;
}

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = clientIpFrom(h.get("x-forwarded-for"), h.get("x-real-ip"));
  return { ip, userAgent: h.get("user-agent")?.slice(0, 500) ?? null };
}

export const toDbDataMode = (m: DataMode): DbDataMode => (m === "demo" ? "DEMO" : "REAL");
export const fromDbDataMode = (m: DbDataMode): DataMode => (m === "DEMO" ? "demo" : "real");

/** Сессии хранятся в реальной базе (единая identity); режим данных фиксируется сервером при создании сессии. */
export async function createSession(userId: string, activeCompanyId: string | null, meta: RequestMeta, dataMode: DataMode = "real") {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + ttlMs());
  const session = await authDb.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      dataMode: toDbDataMode(dataMode),
      activeCompanyId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  });
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await authDb.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}

async function loadSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await authDb.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  // Скользящее обновление «последней активности» не чаще раза в 5 минут
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await authDb.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

/** Сессия текущего запроса (кешируется на время запроса). Режим данных — только отсюда, не из запроса клиента. */
export const getCurrentSession = cache(loadSession);

/** Режим данных текущей сессии; без сессии — null (вход, регистрация). */
export async function getSessionDataMode(): Promise<DataMode | null> {
  const session = await getCurrentSession();
  return session ? fromDbDataMode(session.dataMode) : null;
}

/**
 * Текущий актор или null (кешируется на время запроса).
 * Identity (существование, блокировка, роль платформы) проверяется по реальной базе; членства и права в компании —
 * по базе режима сессии. Режим привязывается к запросу до первого бизнес-запроса.
 */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const session = await getCurrentSession();
  if (!session) return null;
  const mode = fromDbDataMode(session.dataMode);
  bindRenderDataMode(mode);
  const identity = await authDb.user.findUnique({
    where: { id: session.userId },
    select: { status: true, deletedAt: true, platformRole: true },
  });
  if (!identity || identity.deletedAt || identity.status === "BLOCKED") return null;

  return runWithDataMode(mode, async () => {
    const build = () => buildActor(session.userId, { activeCompanyId: session.activeCompanyId, sessionId: session.id, meta: undefined });
    let actor: Actor;
    try {
      actor = await build();
    } catch (e) {
      if (!isAppError(e) || mode !== "demo") {
        if (isAppError(e)) return null; // удалён / заблокирован
        throw e;
      }
      // Демо-база пересоздана после входа — восстанавливаем рабочее пространство пользователя
      const { provisionDemoIdentity } = await import("@/server/services/demo-workspace.service");
      await provisionDemoIdentity(session.userId);
      try {
        actor = await build();
      } catch (again) {
        if (isAppError(again)) return null;
        throw again;
      }
    }
    // Роль платформы — всегда из реальной identity: режим данных не расширяет и не сужает права.
    const isAdmin = identity.platformRole === "PLATFORM_ADMIN";
    const meta = await getRequestMeta();
    return {
      ...actor,
      platformRole: identity.platformRole,
      isAdmin,
      permissions: permissionsForMembership(actor.active, isAdmin),
      dataMode: mode,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
  });
});

/** Требует авторизацию, иначе бросает UNAUTHORIZED. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw errors.unauthorized();
  return actor;
}

export async function setActiveCompany(sessionId: string, companyId: string) {
  await authDb.session.update({ where: { id: sessionId }, data: { activeCompanyId: companyId } });
}
