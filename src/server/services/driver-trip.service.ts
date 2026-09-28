import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { errors } from "@/lib/errors";
import { RESOURCE_BUSY_STATUSES } from "@/lib/state-machine/order-state-machine";

/** Компании, в которых пользователь — водитель. Рейсы ищутся только у этих перевозчиков. */
function requireDriver(actor: Actor): string[] {
  const companyIds = actor.memberships.filter((m) => m.role === "DRIVER").map((m) => m.companyId);
  if (companyIds.length === 0) throw errors.forbidden("Раздел доступен водителям.");
  return companyIds;
}

const tripInclude = {
  load: {
    select: {
      title: true,
      weightKg: true,
      volumeM3: true,
      packagesCount: true,
      packageType: true,
      cargoType: true,
      temperatureFrom: true,
      temperatureTo: true,
      notes: true,
      stops: { orderBy: { sequence: "asc" as const } },
    },
  },
  vehicle: { select: { plateNumber: true, make: true, model: true, bodyType: true } },
  carrier: { select: { legalName: true, phone: true } },
  shipper: { select: { legalName: true, phone: true } },
};

/** Текущий рейс водителя (без финансовых данных). */
export async function getMyTrip(actor: Actor) {
  const companyIds = requireDriver(actor);
  const mine = { driver: { userId: actor.userId }, carrierCompanyId: { in: companyIds } };
  // Сначала — активный рейс; доставленный (ждёт подтверждения заказчиком) показывается, пока нового рейса нет
  const order =
    (await prisma.transportOrder.findFirst({
      where: { ...mine, currentStatus: { in: RESOURCE_BUSY_STATUSES }, deliveredAt: null },
      orderBy: [{ loadingDate: "asc" }],
      include: tripInclude,
    })) ??
    (await prisma.transportOrder.findFirst({
      where: { ...mine, currentStatus: "DELIVERED" },
      orderBy: [{ deliveredAt: "desc" }],
      include: tripInclude,
    }));
  if (!order) return null;
  const [lastLocation, docs] = await Promise.all([
    prisma.trackingEvent.findFirst({
      where: { orderId: order.id, latitude: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orderDocument.findMany({
      where: {
        orderId: order.id,
        status: "ACTIVE",
        type: { in: ["CMR", "CARGO_PHOTO", "SEAL_PHOTO", "PROOF_OF_DELIVERY", "DRIVER_DOCUMENT", "VEHICLE_DOCUMENT", "OTHER"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, filename: true, createdAt: true },
    }),
  ]);
  const { agreedAmount: _a, acceptedBidId: _b, ...safe } = order;
  void _a;
  void _b;
  return { order: safe, lastLocation, documents: docs };
}

export async function listMyTrips(actor: Actor, opts: { page: number; pageSize: number }) {
  const companyIds = requireDriver(actor);
  const where = { driver: { userId: actor.userId }, carrierCompanyId: { in: companyIds } };
  const [items, total] = await Promise.all([
    prisma.transportOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        publicNumber: true,
        currentStatus: true,
        loadingDate: true,
        deliveredAt: true,
        closedAt: true,
        load: { select: { originCity: true, originCountry: true, destinationCity: true, destinationCountry: true } },
        vehicle: { select: { plateNumber: true } },
      },
    }),
    prisma.transportOrder.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getMyDriverProfile(actor: Actor) {
  requireDriver(actor);
  return prisma.driverProfile.findMany({
    where: { userId: actor.userId, deletedAt: null },
    include: { company: { select: { legalName: true, phone: true } } },
  });
}
