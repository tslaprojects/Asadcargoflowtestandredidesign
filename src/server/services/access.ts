import "server-only";
import type { Actor, ActorMembership } from "@/lib/auth/actor";
import { permissionsForMembership } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import { isCarrierRole, isCustomerRole, type Permission } from "@/lib/permissions";
import type { ActorSide } from "@/lib/state-machine/order-state-machine";

export type OrderSide = Exclude<ActorSide, "SYSTEM">;

export type OrderAccess = {
  side: OrderSide;
  /** Членство, через которое пользователь связан со сделкой (null для администратора). */
  membership: ActorMembership | null;
  permissions: Set<Permission>;
  can: (p: Permission) => boolean;
};

type OrderRelationFields = {
  shipperCompanyId: string;
  carrierCompanyId: string;
  forwarderCompanyId: string | null;
  driver?: { userId: string | null } | null;
};

/**
 * Определяет, как пользователь связан со сделкой. Учитываются все членства пользователя,
 * а права берутся из роли в той компании, которая участвует в сделке.
 */
export function resolveOrderAccess(actor: Actor, order: OrderRelationFields): OrderAccess | null {
  const make = (side: OrderSide, membership: ActorMembership | null): OrderAccess => {
    const permissions = permissionsForMembership(membership, side === "ADMIN");
    return { side, membership, permissions, can: (p) => permissions.has(p) };
  };
  const customer = actor.memberships.find(
    (m) => isCustomerRole(m.role) && (m.companyId === order.shipperCompanyId || m.companyId === order.forwarderCompanyId),
  );
  if (customer) return make("CUSTOMER", customer);
  const carrier = actor.memberships.find((m) => isCarrierRole(m.role) && m.companyId === order.carrierCompanyId);
  if (carrier) return make("CARRIER", carrier);
  const driverMembership = actor.memberships.find((m) => m.role === "DRIVER" && m.companyId === order.carrierCompanyId);
  if (driverMembership && order.driver?.userId === actor.userId) return make("DRIVER", driverMembership);
  if (actor.isAdmin) return make("ADMIN", null);
  return null;
}

/** Загружает сделку и проверяет доступ. Бросает 404 (не раскрывая существование) или 403. */
export async function requireOrderAccess(actor: Actor, orderId: string, permission?: Permission) {
  const order = await prisma.transportOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      publicNumber: true,
      currentStatus: true,
      previousStatus: true,
      shipperCompanyId: true,
      carrierCompanyId: true,
      forwarderCompanyId: true,
      vehicleId: true,
      driverId: true,
      agreedAmount: true,
      currency: true,
      loadId: true,
      driver: { select: { userId: true } },
    },
  });
  if (!order) throw errors.notFound("Перевозка не найдена.");
  const access = resolveOrderAccess(actor, order);
  if (!access) throw errors.forbidden("У вас нет доступа к этой перевозке.");
  if (permission && !access.can(permission)) throw errors.forbidden("У вас нет прав на это действие в данной перевозке.");
  return { order, access };
}

/** Prisma-фильтр «сделки, связанные с пользователем». */
export function ordersWhereForActor(actor: Actor) {
  if (actor.isAdmin && actor.memberships.length === 0) return {};
  const customerIds = actor.memberships.filter((m) => isCustomerRole(m.role)).map((m) => m.companyId);
  const carrierIds = actor.memberships.filter((m) => isCarrierRole(m.role)).map((m) => m.companyId);
  const or: object[] = [];
  if (customerIds.length) {
    or.push({ shipperCompanyId: { in: customerIds } }, { forwarderCompanyId: { in: customerIds } });
  }
  if (carrierIds.length) or.push({ carrierCompanyId: { in: carrierIds } });
  if (actor.memberships.some((m) => m.role === "DRIVER")) or.push({ driver: { userId: actor.userId } });
  if (or.length === 0) return { id: "00000000-0000-0000-0000-000000000000" };
  return { OR: or };
}

/** Фильтр по активной компании (для dashboard и списков в контексте текущей компании). */
export function ordersWhereForActiveCompany(actor: Actor) {
  const m = actor.active;
  if (!m) return actor.isAdmin ? {} : { id: "00000000-0000-0000-0000-000000000000" };
  if (isCustomerRole(m.role)) return { OR: [{ shipperCompanyId: m.companyId }, { forwarderCompanyId: m.companyId }] };
  if (isCarrierRole(m.role)) return { carrierCompanyId: m.companyId };
  if (m.role === "DRIVER") return { driver: { userId: actor.userId } };
  return { id: "00000000-0000-0000-0000-000000000000" };
}

// ─────────── Грузы ───────────

export type LoadRelation = "OWNER" | "CARRIER" | "VIEWER" | "ADMIN";

type LoadRelationFields = {
  id: string;
  companyId: string;
  status: string;
  visibility: string;
  deletedAt: Date | null;
  invitations?: { carrierCompanyId: string }[];
  bids?: { carrierCompanyId: string }[];
};

/** Как пользователь связан с грузом. null — нет доступа. */
export function resolveLoadRelation(
  actor: Actor,
  load: LoadRelationFields,
): { relation: LoadRelation; membership: ActorMembership | null } | null {
  const owner = actor.memberships.find((m) => isCustomerRole(m.role) && m.companyId === load.companyId);
  if (owner) return { relation: "OWNER", membership: owner };
  if (load.deletedAt) return actor.isAdmin ? { relation: "ADMIN", membership: null } : null;

  const carrier = actor.memberships.find((m) => isCarrierRole(m.role));
  if (carrier) {
    const hasBid = load.bids?.some((b) => actor.memberships.some((m) => m.companyId === b.carrierCompanyId)) ?? false;
    const published = load.status === "PUBLISHED" || load.status === "BIDDING";
    const invited = load.invitations?.some((i) => actor.memberships.some((m) => m.companyId === i.carrierCompanyId)) ?? false;
    const visible = published && (load.visibility === "MARKETPLACE" || (load.visibility === "INVITE_ONLY" && invited));
    if (hasBid || visible) {
      const bidMembership =
        actor.memberships.find((m) => isCarrierRole(m.role) && load.bids?.some((b) => b.carrierCompanyId === m.companyId)) ??
        actor.memberships.find((m) => isCarrierRole(m.role) && load.invitations?.some((i) => i.carrierCompanyId === m.companyId)) ??
        carrier;
      return { relation: "CARRIER", membership: bidMembership };
    }
  }
  // Экспедитор может просматривать биржу
  const forwarder = actor.memberships.find((m) => m.role === "FORWARDER");
  if (forwarder && load.visibility === "MARKETPLACE" && (load.status === "PUBLISHED" || load.status === "BIDDING")) {
    return { relation: "VIEWER", membership: forwarder };
  }
  if (actor.isAdmin) return { relation: "ADMIN", membership: null };
  return null;
}

export async function requireLoadRelation(actor: Actor, loadId: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      companyId: true,
      status: true,
      visibility: true,
      deletedAt: true,
      invitations: { select: { carrierCompanyId: true } },
      bids: { select: { carrierCompanyId: true } },
    },
  });
  if (!load) throw errors.notFound("Груз не найден.");
  const rel = resolveLoadRelation(actor, load);
  if (!rel) throw errors.notFound("Груз не найден или недоступен.");
  return { load, ...rel };
}
