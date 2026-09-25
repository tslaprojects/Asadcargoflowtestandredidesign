import "server-only";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import type { Actor } from "@/lib/auth/actor";
import type { Permission } from "@/lib/permissions";
import { isCarrierRole, isCustomerRole } from "@/lib/permissions";
import type { NavKind } from "@/components/layout/nav-config";

/** Актор для серверной страницы; без сессии — на /login. */
export async function pageActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Требует право; иначе показывает страницу «нет доступа» (403). */
export async function pageActorWith(permission: Permission): Promise<Actor> {
  const actor = await pageActor();
  if (!actor.permissions.has(permission)) redirect(`/forbidden?need=${permission}`);
  return actor;
}

export function navKindFor(actor: Actor): NavKind {
  const r = actor.active?.role;
  if (!r) return actor.isAdmin ? "admin" : "none";
  if (r === "FORWARDER") return "forwarder";
  if (isCustomerRole(r)) return "customer";
  if (isCarrierRole(r)) return "carrier";
  return "driver";
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function sp(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function pageNum(params: Record<string, string | string[] | undefined>): number {
  const n = Number(sp(params, "page") ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Обёртка для вызова сервисов из серверных страниц: бизнес-ошибки доступа
 * превращаются в страницы 404 / «нет доступа» / вход, а не в 500.
 */
export async function guard<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    const { isAppError } = await import("@/lib/errors");
    if (isAppError(e)) {
      const { notFound } = await import("next/navigation");
      if (e.code === "NOT_FOUND") notFound();
      if (e.code === "UNAUTHORIZED") redirect("/login");
      if (e.code === "FORBIDDEN") redirect(`/forbidden?reason=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}
