import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { isCarrierRole, isCustomerRole } from "@/lib/permissions";
import { ordersWhereForActor } from "./access";
import { actualLoadWhere } from "@/lib/validation/bid";

/** Глобальный поиск с учётом прав: заказы, грузы, компании, автомобили. */
export async function globalSearch(actor: Actor, query: string) {
  const q = query.trim();
  if (q.length < 2) return { orders: [], loads: [], companies: [], vehicles: [] };
  const contains = { contains: q, mode: "insensitive" as const };
  const myIds = actor.memberships.map((m) => m.companyId);
  const customerIds = actor.memberships.filter((m) => isCustomerRole(m.role)).map((m) => m.companyId);
  const carrierIds = actor.memberships.filter((m) => isCarrierRole(m.role)).map((m) => m.companyId);
  const canMarket = actor.permissions.has("MARKETPLACE_VIEW") || carrierIds.length > 0;

  const loadVisibility = actor.isAdmin
    ? {}
    : {
        OR: [
          { companyId: { in: customerIds } },
          ...(canMarket
            ? [
                { status: { in: ["PUBLISHED" as const, "BIDDING" as const] }, visibility: "MARKETPLACE" as const, ...actualLoadWhere() },
                {
                  status: { in: ["PUBLISHED" as const, "BIDDING" as const] },
                  invitations: { some: { carrierCompanyId: { in: carrierIds } } },
                  ...actualLoadWhere(),
                },
              ]
            : []),
          { bids: { some: { carrierCompanyId: { in: carrierIds } } } },
        ],
      };

  const [orders, loads, companies, vehicles] = await Promise.all([
    prisma.transportOrder.findMany({
      where: {
        AND: [
          ordersWhereForActor(actor),
          { OR: [{ publicNumber: contains }, { load: { publicNumber: contains } }, { vehicle: { plateNumber: contains } }] },
        ],
      },
      take: 6,
      select: { id: true, publicNumber: true, currentStatus: true, load: { select: { originCity: true, destinationCity: true } } },
    }),
    actor.memberships.every((m) => m.role === "DRIVER") && !actor.isAdmin
      ? Promise.resolve([])
      : prisma.load.findMany({
          where: {
            AND: [
              { deletedAt: null },
              loadVisibility,
              { OR: [{ publicNumber: contains }, { title: contains }, { originCity: contains }, { destinationCity: contains }] },
            ],
          },
          take: 6,
          select: { id: true, publicNumber: true, title: true, status: true, originCity: true, destinationCity: true },
        }),
    prisma.company.findMany({
      where: {
        deletedAt: null,
        OR: [{ legalName: contains }, { tradeName: contains }, { registrationNumber: contains }],
        ...(actor.isAdmin
          ? {}
          : { OR: [{ id: { in: myIds } }, { type: "CARRIER" as const }, { type: "SHIPPER" as const }, { type: "FORWARDER" as const }] }),
      },
      take: 6,
      select: { id: true, legalName: true, type: true, verificationStatus: true, city: true },
    }),
    prisma.vehicle.findMany({
      where: { deletedAt: null, plateNumber: contains, ...(actor.isAdmin ? {} : { companyId: { in: carrierIds } }) },
      take: 6,
      select: { id: true, plateNumber: true, make: true, model: true, status: true },
    }),
  ]);
  return { orders, loads, companies, vehicles };
}
