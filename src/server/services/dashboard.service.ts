import "server-only";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { isCarrierRole, isCustomerRole } from "@/lib/permissions";
import { ACTIVE_STATUSES, IN_TRANSIT_STATUSES } from "@/lib/state-machine/order-state-machine";
import { ordersWhereForActiveCompany } from "./access";

export type ActionItem = { key: string; title: string; description: string; href: string; tone: "warning" | "info" | "danger" };

const recentOrderSelect = {
  id: true,
  publicNumber: true,
  currentStatus: true,
  agreedAmount: true,
  currency: true,
  updatedAt: true,
  loadingDate: true,
  load: { select: { originCity: true, originCountry: true, destinationCity: true, destinationCountry: true, clientName: true } },
  carrier: { select: { legalName: true } },
  shipper: { select: { legalName: true } },
};

export async function customerDashboard(actor: Actor) {
  const m = actor.active!;
  const orderWhere = ordersWhereForActiveCompany(actor);
  const [
    active,
    awaitingSelection,
    inTransit,
    delivered,
    recent,
    toSign,
    bidding,
    toConfirm,
    closedNoReview,
    disputes,
    bidsCount,
    loadsCount,
  ] = await Promise.all([
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: { in: ACTIVE_STATUSES } }] } }),
    prisma.load.count({ where: { companyId: m.companyId, status: { in: ["PUBLISHED", "BIDDING"] }, deletedAt: null } }),
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: { in: IN_TRANSIT_STATUSES } }] } }),
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: { in: ["DELIVERED", "CLOSED"] } }] } }),
    prisma.transportOrder.findMany({ where: orderWhere, orderBy: { updatedAt: "desc" }, take: 8, select: recentOrderSelect }),
    prisma.transportOrder.findMany({
      where: {
        AND: [orderWhere, { currentStatus: "CONTRACT_PENDING" }],
        contracts: {
          some: {
            status: { in: ["PENDING_SIGNATURES", "PARTIALLY_SIGNED"] },
            signatures: { none: { companyId: m.companyId, signatureStatus: "SIGNED" } },
          },
        },
      },
      select: { id: true, publicNumber: true },
      take: 10,
    }),
    prisma.load.findMany({
      where: { companyId: m.companyId, status: "BIDDING", deletedAt: null },
      select: { id: true, publicNumber: true, _count: { select: { bids: { where: { status: "PENDING" } } } } },
      take: 10,
    }),
    prisma.transportOrder.findMany({
      where: { AND: [orderWhere, { currentStatus: "DELIVERED" }] },
      select: { id: true, publicNumber: true },
      take: 10,
    }),
    prisma.transportOrder.findMany({
      where: {
        AND: [orderWhere, { currentStatus: "CLOSED" }],
        reviews: { none: { fromCompanyId: m.companyId } },
        closedAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      },
      select: { id: true, publicNumber: true },
      take: 5,
    }),
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: "DISPUTED" }] } }),
    prisma.bid.count({ where: { load: { companyId: m.companyId } } }),
    prisma.load.count({ where: { companyId: m.companyId, deletedAt: null } }),
  ]);

  const actions: ActionItem[] = [
    ...toSign.map((o) => ({
      key: `sign-${o.id}`,
      title: `Подпишите договор ${o.publicNumber}`,
      description: "Договор ожидает вашей подписи",
      href: `/orders/${o.id}?tab=contract`,
      tone: "warning" as const,
    })),
    ...bidding
      .filter((l) => l._count.bids > 0)
      .map((l) => ({
        key: `bids-${l.id}`,
        title: `Выберите перевозчика ${l.publicNumber}`,
        description: `Предложений: ${l._count.bids}`,
        href: `/loads/${l.id}?tab=bids`,
        tone: "warning" as const,
      })),
    ...toConfirm.map((o) => ({
      key: `confirm-${o.id}`,
      title: `Подтвердите получение ${o.publicNumber}`,
      description: "Перевозчик отметил доставку",
      href: `/orders/${o.id}`,
      tone: "warning" as const,
    })),
    ...closedNoReview.map((o) => ({
      key: `review-${o.id}`,
      title: `Оставьте отзыв ${o.publicNumber}`,
      description: "Перевозка завершена",
      href: `/orders/${o.id}`,
      tone: "info" as const,
    })),
  ];
  return {
    kpi: { active, awaitingSelection, inTransit, delivered, disputes, bidsCount, loadsCount },
    actions,
    recent,
  };
}

export async function carrierDashboard(actor: Actor) {
  const m = actor.active!;
  const orderWhere = ordersWhereForActiveCompany(actor);
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: m.companyId, deletedAt: null },
    select: { bodyType: true, capacityKg: true, status: true },
  });
  const maxCapacity = vehicles.reduce((a, v) => Math.max(a, Number(v.capacityKg)), 0);
  const bodyTypes = [...new Set(vehicles.map((v) => v.bodyType))];
  const marketWhere = {
    status: { in: ["PUBLISHED" as const, "BIDDING" as const] },
    deletedAt: null,
    OR: [
      { visibility: "MARKETPLACE" as const },
      { visibility: "INVITE_ONLY" as const, invitations: { some: { carrierCompanyId: m.companyId } } },
    ],
  };
  const [
    available,
    activeTrips,
    inTransit,
    delivered,
    matching,
    toSign,
    toAssignVehicle,
    toAssignDriver,
    counters,
    needPod,
    closedNoReview,
    recent,
    bidsCount,
  ] = await Promise.all([
    prisma.load.count({ where: marketWhere }),
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: { in: ACTIVE_STATUSES } }] } }),
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: { in: IN_TRANSIT_STATUSES } }] } }),
    prisma.transportOrder.count({ where: { AND: [orderWhere, { currentStatus: { in: ["DELIVERED", "CLOSED"] } }] } }),
    prisma.load.findMany({
      where: {
        ...marketWhere,
        bids: { none: { carrierCompanyId: m.companyId, status: "PENDING" } },
        ...(maxCapacity > 0 ? { weightKg: { lte: maxCapacity } } : {}),
        ...(bodyTypes.length ? { OR: [{ bodyType: null }, { bodyType: { in: bodyTypes } }] } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
      omit: { routeGeometry: true },
      include: {
        stops: { orderBy: { sequence: "asc" }, select: { country: true, city: true, type: true, sequence: true } },
        company: { select: { legalName: true, verificationStatus: true } },
      },
    }),
    prisma.transportOrder.findMany({
      where: {
        AND: [orderWhere, { currentStatus: "CONTRACT_PENDING" }],
        contracts: {
          some: {
            status: { in: ["PENDING_SIGNATURES", "PARTIALLY_SIGNED"] },
            signatures: { none: { companyId: m.companyId, signatureStatus: "SIGNED" } },
          },
        },
      },
      select: { id: true, publicNumber: true },
    }),
    prisma.transportOrder.findMany({
      where: { AND: [orderWhere, { currentStatus: "CONTRACT_SIGNED" }] },
      select: { id: true, publicNumber: true },
    }),
    prisma.transportOrder.findMany({
      where: { AND: [orderWhere, { currentStatus: "VEHICLE_ASSIGNED" }] },
      select: { id: true, publicNumber: true },
    }),
    prisma.bid.findMany({
      where: { carrierCompanyId: m.companyId, status: "PENDING", awaitingSide: "CARRIER" },
      select: { id: true, loadId: true, load: { select: { publicNumber: true } } },
    }),
    prisma.transportOrder.findMany({
      where: {
        AND: [orderWhere, { currentStatus: { in: ["AT_DELIVERY", "DELIVERED"] } }],
        documents: { none: { type: { in: ["CMR", "PROOF_OF_DELIVERY"] }, status: "ACTIVE" } },
      },
      select: { id: true, publicNumber: true },
    }),
    prisma.transportOrder.findMany({
      where: {
        AND: [orderWhere, { currentStatus: "CLOSED" }],
        reviews: { none: { fromCompanyId: m.companyId } },
        closedAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      },
      select: { id: true, publicNumber: true },
      take: 5,
    }),
    prisma.transportOrder.findMany({ where: orderWhere, orderBy: { updatedAt: "desc" }, take: 8, select: recentOrderSelect }),
    prisma.bid.count({ where: { carrierCompanyId: m.companyId } }),
  ]);
  const actions: ActionItem[] = [
    ...toSign.map((o) => ({
      key: `sign-${o.id}`,
      title: `Подпишите договор ${o.publicNumber}`,
      description: "Договор ожидает вашей подписи",
      href: `/orders/${o.id}?tab=contract`,
      tone: "warning" as const,
    })),
    ...counters.map((b) => ({
      key: `counter-${b.id}`,
      title: `Ответьте на встречную цену ${b.load.publicNumber}`,
      description: "Заказчик предложил другую цену",
      href: `/loads/${b.loadId}?tab=bids`,
      tone: "warning" as const,
    })),
    ...toAssignVehicle.map((o) => ({
      key: `veh-${o.id}`,
      title: `Назначьте автомобиль ${o.publicNumber}`,
      description: "Договор подписан",
      href: `/orders/${o.id}`,
      tone: "warning" as const,
    })),
    ...toAssignDriver.map((o) => ({
      key: `drv-${o.id}`,
      title: `Назначьте водителя ${o.publicNumber}`,
      description: "Автомобиль назначен",
      href: `/orders/${o.id}`,
      tone: "warning" as const,
    })),
    ...needPod.map((o) => ({
      key: `pod-${o.id}`,
      title: `Загрузите CMR ${o.publicNumber}`,
      description: "Нужно подтверждение доставки",
      href: `/orders/${o.id}?tab=documents`,
      tone: "info" as const,
    })),
    ...closedNoReview.map((o) => ({
      key: `review-${o.id}`,
      title: `Оставьте отзыв ${o.publicNumber}`,
      description: "Перевозка завершена",
      href: `/orders/${o.id}`,
      tone: "info" as const,
    })),
  ];
  return {
    kpi: {
      available,
      activeTrips,
      inTransit,
      delivered,
      bidsCount,
      vehicles: vehicles.length,
      freeVehicles: vehicles.filter((v) => v.status === "AVAILABLE").length,
    },
    matching,
    actions,
    recent,
  };
}

export async function forwarderDashboard(actor: Actor) {
  const base = await customerDashboard(actor);
  const m = actor.active!;
  const orderWhere = ordersWhereForActiveCompany(actor);
  const [activeLoads, attention] = await Promise.all([
    prisma.load.count({ where: { companyId: m.companyId, status: { in: ["PUBLISHED", "BIDDING", "CARRIER_SELECTED"] }, deletedAt: null } }),
    prisma.transportOrder.count({
      where: { AND: [orderWhere, { currentStatus: { in: ["CONTRACT_PENDING", "DELIVERED", "DISPUTED", "ON_HOLD"] } }] },
    }),
  ]);
  return { ...base, kpi: { ...base.kpi, activeLoads, attention } };
}

export function dashboardKind(actor: Actor): "customer" | "forwarder" | "carrier" | "driver" | "admin" | "none" {
  const r = actor.active?.role;
  if (!r) return actor.isAdmin ? "admin" : "none";
  if (r === "FORWARDER") return "forwarder";
  if (isCustomerRole(r)) return "customer";
  if (isCarrierRole(r)) return "carrier";
  return "driver";
}
