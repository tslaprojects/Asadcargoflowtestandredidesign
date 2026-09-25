import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requireActiveCompany, requirePermission, type Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { isCarrierRole } from "@/lib/permissions";
import { RESOURCE_BUSY_STATUSES } from "@/lib/state-machine/order-state-machine";
import type { driverSchema, vehicleSchema } from "@/lib/validation/company";
import { inviteMember } from "./company.service";

type VehicleInput = z.output<typeof vehicleSchema>;
type DriverInput = z.output<typeof driverSchema>;

function carrierCompany(actor: Actor) {
  const m = requireActiveCompany(actor);
  if (!isCarrierRole(m.role)) throw errors.forbidden("Раздел доступен только перевозчикам.");
  return m;
}

// ─────────── Автомобили ───────────

export async function listVehicles(actor: Actor, opts: { q?: string; status?: string; page: number; pageSize: number }) {
  requirePermission(actor, "VEHICLE_VIEW");
  const m = carrierCompany(actor);
  const where: Prisma.VehicleWhereInput = {
    companyId: m.companyId,
    deletedAt: null,
    ...(opts.status ? { status: opts.status as "AVAILABLE" } : {}),
    ...(opts.q
      ? {
          OR: [
            { plateNumber: { contains: opts.q, mode: "insensitive" } },
            { make: { contains: opts.q, mode: "insensitive" } },
            { model: { contains: opts.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      orderBy: [{ status: "asc" }, { plateNumber: "asc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        orders: {
          where: { currentStatus: { in: RESOURCE_BUSY_STATUSES } },
          select: { id: true, publicNumber: true, currentStatus: true },
          take: 1,
        },
      },
    }),
    prisma.vehicle.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function createVehicle(actor: Actor, input: VehicleInput) {
  requirePermission(actor, "VEHICLE_MANAGE");
  const m = carrierCompany(actor);
  try {
    return await prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.create({
        data: { ...input, status: input.status ?? "AVAILABLE", companyId: m.companyId },
      });
      await audit(
        actor,
        {
          action: AuditAction.VEHICLE_CREATED,
          entityType: "Vehicle",
          entityId: v.id,
          companyId: m.companyId,
          newValue: { plateNumber: v.plateNumber },
        },
        tx,
      );
      return v;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw errors.validation("Автомобиль с таким госномером уже зарегистрирован в этой стране.", {
        plateNumber: ["Госномер уже используется"],
      });
    }
    throw e;
  }
}

export async function updateVehicle(actor: Actor, vehicleId: string, input: VehicleInput) {
  requirePermission(actor, "VEHICLE_MANAGE");
  const m = carrierCompany(actor);
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v || v.deletedAt || v.companyId !== m.companyId) throw errors.notFound("Автомобиль не найден.");
  if (v.status === "ASSIGNED" && input.status && input.status !== "AVAILABLE") {
    throw new AppError("VEHICLE_UNAVAILABLE", "Автомобиль на рейсе — сначала снимите его с перевозки.");
  }
  const nextStatus = v.status === "ASSIGNED" ? "ASSIGNED" : (input.status ?? v.status);
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({ where: { id: vehicleId }, data: { ...input, status: nextStatus } });
      await audit(
        actor,
        {
          action: AuditAction.VEHICLE_UPDATED,
          entityType: "Vehicle",
          entityId: vehicleId,
          companyId: m.companyId,
          oldValue: { plateNumber: v.plateNumber, status: v.status, capacityKg: v.capacityKg },
          newValue: { plateNumber: updated.plateNumber, status: updated.status, capacityKg: updated.capacityKg },
        },
        tx,
      );
      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw errors.validation("Автомобиль с таким госномером уже зарегистрирован.", { plateNumber: ["Госномер уже используется"] });
    }
    throw e;
  }
}

export async function deleteVehicle(actor: Actor, vehicleId: string) {
  requirePermission(actor, "VEHICLE_MANAGE");
  const m = carrierCompany(actor);
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v || v.deletedAt || v.companyId !== m.companyId) throw errors.notFound("Автомобиль не найден.");
  if (v.status === "ASSIGNED") throw new AppError("VEHICLE_UNAVAILABLE", "Нельзя удалить автомобиль, назначенный на рейс.");
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { deletedAt: new Date(), status: "INACTIVE" } });
    await audit(
      actor,
      {
        action: AuditAction.VEHICLE_UPDATED,
        entityType: "Vehicle",
        entityId: vehicleId,
        companyId: m.companyId,
        newValue: { deleted: true },
      },
      tx,
    );
  });
  return { ok: true };
}

// ─────────── Водители ───────────

export async function listDrivers(actor: Actor, opts: { q?: string; page: number; pageSize: number }) {
  requirePermission(actor, "DRIVER_VIEW");
  const m = carrierCompany(actor);
  const where: Prisma.DriverProfileWhereInput = {
    companyId: m.companyId,
    deletedAt: null,
    ...(opts.q ? { OR: [{ fullName: { contains: opts.q, mode: "insensitive" } }, { phone: { contains: opts.q } }] } : {}),
  };
  const [items, total, invites] = await Promise.all([
    prisma.driverProfile.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        user: { select: { email: true, lastLoginAt: true } },
        orders: {
          where: { currentStatus: { in: RESOURCE_BUSY_STATUSES } },
          select: { id: true, publicNumber: true, currentStatus: true },
        },
      },
    }),
    prisma.driverProfile.count({ where }),
    prisma.companyInvite.findMany({
      where: { companyId: m.companyId, role: "DRIVER", status: "PENDING" },
      select: { driverProfileId: true, email: true, expiresAt: true },
    }),
  ]);
  const inviteByDriver = Object.fromEntries(invites.filter((i) => i.driverProfileId).map((i) => [i.driverProfileId!, i]));
  return {
    items: items.map((d) => ({ ...d, pendingInvite: inviteByDriver[d.id] ?? null })),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export async function createDriver(actor: Actor, input: DriverInput) {
  requirePermission(actor, "DRIVER_MANAGE");
  const m = carrierCompany(actor);
  const { inviteEmail, ...data } = input;
  const driver = await prisma.$transaction(async (tx) => {
    const d = await tx.driverProfile.create({ data: { ...data, status: data.status ?? "ACTIVE", companyId: m.companyId } });
    await audit(
      actor,
      {
        action: AuditAction.DRIVER_CREATED,
        entityType: "DriverProfile",
        entityId: d.id,
        companyId: m.companyId,
        newValue: { fullName: d.fullName },
      },
      tx,
    );
    return d;
  });
  let invite = null;
  if (inviteEmail) invite = await inviteMember(actor, m.companyId, { email: inviteEmail, role: "DRIVER", driverProfileId: driver.id });
  return { driver, invite };
}

export async function inviteDriver(actor: Actor, driverId: string, email: string) {
  requirePermission(actor, "DRIVER_MANAGE");
  const m = carrierCompany(actor);
  const d = await prisma.driverProfile.findUnique({ where: { id: driverId } });
  if (!d || d.deletedAt || d.companyId !== m.companyId) throw errors.notFound("Водитель не найден.");
  if (d.userId) throw new AppError("DUPLICATE_ACTION", "У водителя уже есть доступ к приложению.");
  return inviteMember(actor, m.companyId, { email, role: "DRIVER", driverProfileId: d.id });
}

export async function updateDriver(actor: Actor, driverId: string, input: DriverInput) {
  requirePermission(actor, "DRIVER_MANAGE");
  const m = carrierCompany(actor);
  const d = await prisma.driverProfile.findUnique({
    where: { id: driverId },
    include: { orders: { where: { currentStatus: { in: RESOURCE_BUSY_STATUSES } }, select: { id: true } } },
  });
  if (!d || d.deletedAt || d.companyId !== m.companyId) throw errors.notFound("Водитель не найден.");
  if (input.status && input.status !== "ACTIVE" && d.orders.length) {
    throw new AppError("DRIVER_UNAVAILABLE", "Водитель выполняет рейс — сначала снимите его с перевозки.");
  }
  const { inviteEmail: _ignored, ...data } = input;
  void _ignored;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.driverProfile.update({ where: { id: driverId }, data });
    await audit(
      actor,
      {
        action: AuditAction.DRIVER_UPDATED,
        entityType: "DriverProfile",
        entityId: driverId,
        companyId: m.companyId,
        oldValue: { fullName: d.fullName, status: d.status },
        newValue: { fullName: updated.fullName, status: updated.status },
      },
      tx,
    );
    return updated;
  });
}
