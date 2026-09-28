import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { label } from "@/lib/i18n";
import { validateUpload } from "@/lib/storage/file-validation";
import { buildStorageKey, storage } from "@/lib/storage/storage";
import type { anomalyReviewSchema, investigationCreateSchema, investigationUpdateSchema } from "@/lib/validation/fuel";
import { assertFuelCompanyAccess, canSeeFuelMoney, fuelScope, hideFuelMoney } from "./fuel-access";
import { telemetryPoints } from "./fuel-analysis.service";
import { CARRIER_OFFICE_ROLES, companyUserIds, notify } from "./notification.service";

/**
 * Проверка несоответствий и расследования. Система не обвиняет водителя: владелец или администратор
 * изучает данные (заправка, GPS, уровень топлива, рейс, комментарии, документы) и принимает решение.
 */

const anomalyInclude = {
  vehicle: { select: { id: true, plateNumber: true, make: true, model: true, tankCapacityLiters: true } },
  transaction: {
    select: {
      id: true,
      stationName: true,
      stationAddress: true,
      latitude: true,
      longitude: true,
      liters: true,
      totalAmount: true,
      currency: true,
      transactionDate: true,
      matchStatus: true,
      anomalyScore: true,
      levelBefore: true,
      levelAfter: true,
      levelSource: true,
      gpsDistanceKm: true,
      analysis: true,
      isDemo: true,
      driver: { select: { id: true, fullName: true } },
      card: { select: { label: true } },
      order: { select: { id: true, publicNumber: true } },
    },
  },
  investigation: { select: { id: true, title: true, status: true } },
  company: { select: { id: true, legalName: true } },
} satisfies Prisma.FuelAnomalyInclude;

export async function listAnomalies(
  actor: Actor,
  opts: { status?: string; vehicleId?: string; page: number; pageSize: number; allCompanies?: boolean },
) {
  const companyFilter = opts.allCompanies && actor.isAdmin ? {} : { companyId: fuelScope(actor, "FUEL_VIEW").companyId };
  if (opts.allCompanies && !actor.isAdmin) throw errors.forbidden();
  const where: Prisma.FuelAnomalyWhereInput = {
    ...companyFilter,
    ...(opts.status ? { status: opts.status as "OPEN" } : {}),
    ...(opts.vehicleId ? { vehicleId: opts.vehicleId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.fuelAnomaly.findMany({
      where,
      orderBy: [{ status: "asc" }, { score: "desc" }, { detectedAt: "desc" }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: anomalyInclude,
    }),
    prisma.fuelAnomaly.count({ where }),
  ]);
  const money = canSeeFuelMoney(actor);
  return {
    items: money ? items : items.map((a) => ({ ...a, transaction: a.transaction ? hideFuelMoney(a.transaction) : null })),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export async function getAnomaly(actor: Actor, id: string) {
  const a = await prisma.fuelAnomaly.findUnique({ where: { id }, include: anomalyInclude });
  if (!a) throw errors.notFound("Несоответствие не найдено.");
  assertFuelCompanyAccess(actor, a.companyId, "FUEL_VIEW");
  const at = a.transaction?.transactionDate ?? a.detectedAt;
  const points = await telemetryPoints(
    a.vehicleId,
    new Date(at.getTime() - 3 * 3_600_000),
    new Date(at.getTime() + 3 * 3_600_000),
    a.orderId,
  );
  const reviewer = a.reviewedByUserId
    ? await prisma.user.findUnique({ where: { id: a.reviewedByUserId }, select: { firstName: true, lastName: true } })
    : null;
  const anomaly = canSeeFuelMoney(actor) || !a.transaction ? a : { ...a, transaction: hideFuelMoney(a.transaction) };
  return { anomaly, telemetry: points.sort((x, y) => x.recordedAt.getTime() - y.recordedAt.getTime()), reviewer };
}

/** Владелец отмечает результат проверки: несоответствие подтверждено или всё в норме. */
export async function reviewAnomaly(actor: Actor, id: string, input: z.output<typeof anomalyReviewSchema>) {
  const a = await prisma.fuelAnomaly.findUnique({ where: { id } });
  if (!a) throw errors.notFound("Несоответствие не найдено.");
  assertFuelCompanyAccess(actor, a.companyId, "FUEL_INVESTIGATE");
  if (a.status !== "OPEN") throw new AppError("INVALID_STATE_TRANSITION", "Несоответствие уже проверено или передано в расследование.");
  if (input.decision === "DISMISS" && !input.comment) {
    throw errors.validation("Укажите, почему несоответствие не требует дальнейших действий.", { comment: ["Укажите причину"] });
  }
  return prisma.$transaction(async (tx) => {
    const res = await tx.fuelAnomaly.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: input.decision === "CONFIRM" ? "CONFIRMED" : "DISMISSED",
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewComment: input.comment,
      },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "Несоответствие уже изменено.");
    await audit(
      actor,
      {
        action: AuditAction.FUEL_ANOMALY_REVIEWED,
        entityType: "FuelAnomaly",
        entityId: id,
        companyId: a.companyId,
        oldValue: { status: a.status },
        newValue: { decision: input.decision, comment: input.comment },
      },
      tx,
    );
    return tx.fuelAnomaly.findUniqueOrThrow({ where: { id } });
  });
}

// ─────────── Расследования ───────────

export async function openInvestigation(actor: Actor, input: z.output<typeof investigationCreateSchema>) {
  const anomalies = await prisma.fuelAnomaly.findMany({ where: { id: { in: input.anomalyIds } } });
  if (anomalies.length !== new Set(input.anomalyIds).size) throw errors.notFound("Несоответствие не найдено.");
  const companyId = anomalies[0].companyId;
  const vehicleId = anomalies[0].vehicleId;
  if (anomalies.some((a) => a.companyId !== companyId || a.vehicleId !== vehicleId)) {
    throw errors.validation("В одно расследование объединяются несоответствия одного автомобиля.");
  }
  assertFuelCompanyAccess(actor, companyId, "FUEL_INVESTIGATE");
  if (anomalies.some((a) => a.investigationId)) throw new AppError("DUPLICATE_ACTION", "По несоответствию уже открыто расследование.");
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { plateNumber: true, make: true, model: true },
  });
  return prisma.$transaction(async (tx) => {
    const inv = await tx.fuelInvestigation.create({
      data: {
        companyId,
        vehicleId,
        driverId: anomalies.find((a) => a.driverId)?.driverId ?? null,
        title:
          input.title ??
          `Проверка: ${vehicle.make} ${vehicle.model} ${vehicle.plateNumber} — ${label("FuelAnomalyType", anomalies[0].type).toLowerCase()}`,
        openedByUserId: actor.userId,
      },
    });
    const res = await tx.fuelAnomaly.updateMany({
      where: { id: { in: input.anomalyIds }, investigationId: null },
      data: { investigationId: inv.id, status: "INVESTIGATING" },
    });
    if (res.count !== input.anomalyIds.length) throw new AppError("CONFLICT", "Несоответствие уже передано в другое расследование.");
    const txIds = [...new Set(anomalies.map((a) => a.fuelTransactionId).filter(Boolean) as string[])];
    if (txIds.length) {
      await tx.fuelInvestigationTransaction.createMany({ data: txIds.map((id) => ({ investigationId: inv.id, fuelTransactionId: id })) });
    }
    if (input.comment)
      await tx.fuelInvestigationComment.create({ data: { investigationId: inv.id, authorUserId: actor.userId, message: input.comment } });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_INVESTIGATION_OPENED,
        entityType: "FuelInvestigation",
        entityId: inv.id,
        companyId,
        newValue: { anomalyIds: input.anomalyIds, vehicleId },
      },
      tx,
    );
    await notify(tx, {
      userIds: await companyUserIds(tx, companyId, CARRIER_OFFICE_ROLES),
      excludeUserId: actor.userId,
      type: "FUEL_ANOMALY",
      title: `Открыто расследование: ${vehicle.plateNumber}`,
      body: inv.title,
      entityType: "FuelInvestigation",
      entityId: inv.id,
      link: `/fuel/investigations/${inv.id}`,
    });
    return inv;
  });
}

async function loadInvestigation(actor: Actor, id: string, permission: "FUEL_VIEW" | "FUEL_INVESTIGATE") {
  const inv = await prisma.fuelInvestigation.findUnique({ where: { id } });
  if (!inv) throw errors.notFound("Расследование не найдено.");
  assertFuelCompanyAccess(actor, inv.companyId, permission);
  return inv;
}

export async function getInvestigation(actor: Actor, id: string) {
  await loadInvestigation(actor, id, "FUEL_VIEW");
  const inv = await prisma.fuelInvestigation.findUniqueOrThrow({
    where: { id },
    include: {
      vehicle: { select: { id: true, plateNumber: true, make: true, model: true, tankCapacityLiters: true } },
      company: { select: { legalName: true } },
      anomalies: { orderBy: { score: "desc" } },
      transactions: {
        include: {
          transaction: {
            include: {
              driver: { select: { fullName: true } },
              card: { select: { label: true } },
              order: { select: { id: true, publicNumber: true } },
            },
          },
        },
      },
      comments: { orderBy: { createdAt: "asc" } },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });
  const times = inv.transactions
    .map((t) => t.transaction.transactionDate.getTime())
    .concat(inv.anomalies.map((a) => a.detectedAt.getTime()));
  const from = new Date(Math.min(...times) - 3 * 3_600_000);
  const to = new Date(Math.max(...times) + 3 * 3_600_000);
  const [telemetry, users, driver] = await Promise.all([
    telemetryPoints(inv.vehicleId, from, to),
    prisma.user.findMany({
      where: {
        id: {
          in: [
            inv.openedByUserId,
            inv.closedByUserId,
            ...inv.comments.map((c) => c.authorUserId),
            ...inv.attachments.map((a) => a.uploadedByUserId),
          ].filter(Boolean) as string[],
        },
      },
      select: { id: true, firstName: true, lastName: true },
    }),
    inv.driverId ? prisma.driverProfile.findUnique({ where: { id: inv.driverId }, select: { fullName: true } }) : null,
  ]);
  const money = canSeeFuelMoney(actor);
  return {
    investigation: money
      ? inv
      : { ...inv, transactions: inv.transactions.map((x) => ({ ...x, transaction: hideFuelMoney(x.transaction) })) },
    telemetry: telemetry.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()),
    userNames: Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`])),
    driverName: driver?.fullName ?? null,
  };
}

export async function updateInvestigation(actor: Actor, id: string, input: z.output<typeof investigationUpdateSchema>) {
  const inv = await loadInvestigation(actor, id, "FUEL_INVESTIGATE");
  if (inv.status === "RESOLVED" || inv.status === "DISMISSED") throw new AppError("INVALID_STATE_TRANSITION", "Расследование уже закрыто.");
  const closing = input.status === "RESOLVED" || input.status === "DISMISSED";
  if (closing && !input.resolution) throw errors.validation("Опишите итог расследования.", { resolution: ["Укажите итог"] });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.fuelInvestigation.update({
      where: { id },
      data: {
        status: input.status,
        resolution: input.resolution ?? inv.resolution,
        ...(closing ? { closedByUserId: actor.userId, closedAt: new Date() } : {}),
      },
    });
    if (closing) {
      await tx.fuelAnomaly.updateMany({
        where: { investigationId: id },
        data: {
          status: input.status === "RESOLVED" ? "RESOLVED" : "DISMISSED",
          reviewedByUserId: actor.userId,
          reviewedAt: new Date(),
          reviewComment: input.resolution,
        },
      });
    }
    await audit(
      actor,
      {
        action: closing ? AuditAction.FUEL_INVESTIGATION_CLOSED : AuditAction.FUEL_INVESTIGATION_UPDATED,
        entityType: "FuelInvestigation",
        entityId: id,
        companyId: inv.companyId,
        oldValue: { status: inv.status },
        newValue: { status: input.status, resolution: input.resolution },
      },
      tx,
    );
    return updated;
  });
}

export async function commentInvestigation(actor: Actor, id: string, message: string) {
  const inv = await loadInvestigation(actor, id, "FUEL_INVESTIGATE");
  if (inv.status === "RESOLVED" || inv.status === "DISMISSED") throw new AppError("INVALID_STATE_TRANSITION", "Расследование закрыто.");
  return prisma.$transaction(async (tx) => {
    const c = await tx.fuelInvestigationComment.create({ data: { investigationId: id, authorUserId: actor.userId, message } });
    await audit(
      actor,
      { action: AuditAction.FUEL_INVESTIGATION_COMMENTED, entityType: "FuelInvestigation", entityId: id, companyId: inv.companyId },
      tx,
    );
    return c;
  });
}

export async function linkTransaction(actor: Actor, id: string, fuelTransactionId: string) {
  const inv = await loadInvestigation(actor, id, "FUEL_INVESTIGATE");
  const t = await prisma.fuelTransaction.findFirst({ where: { id: fuelTransactionId, companyId: inv.companyId } });
  if (!t) throw errors.notFound("Заправка не найдена.");
  return prisma.$transaction(async (tx) => {
    const link = await tx.fuelInvestigationTransaction.upsert({
      where: { investigationId_fuelTransactionId: { investigationId: id, fuelTransactionId } },
      create: { investigationId: id, fuelTransactionId },
      update: {},
    });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_INVESTIGATION_ATTACHED,
        entityType: "FuelInvestigation",
        entityId: id,
        companyId: inv.companyId,
        newValue: { fuelTransactionId },
      },
      tx,
    );
    return link;
  });
}

/** Документы, фото, отчёты — в защищённом хранилище (тот же StorageAdapter и проверка файлов, что у документов рейса). */
export async function attachToInvestigation(actor: Actor, id: string, input: { file: File; note: string | null }) {
  const inv = await loadInvestigation(actor, id, "FUEL_INVESTIGATE");
  if (inv.status === "RESOLVED" || inv.status === "DISMISSED") throw new AppError("INVALID_STATE_TRANSITION", "Расследование закрыто.");
  const file = await validateUpload(input.file);
  const key = buildStorageKey(`fuel-investigations/${id}`, file.ext);
  await storage().put(key, file.buffer, file.mimeType);
  return prisma.$transaction(async (tx) => {
    const a = await tx.fuelInvestigationAttachment.create({
      data: {
        investigationId: id,
        uploadedByUserId: actor.userId,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        storageKey: key,
        note: input.note,
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.FUEL_INVESTIGATION_ATTACHED,
        entityType: "FuelInvestigation",
        entityId: id,
        companyId: inv.companyId,
        newValue: { filename: file.filename },
      },
      tx,
    );
    return a;
  });
}

export async function getInvestigationAttachment(actor: Actor, attachmentId: string) {
  const a = await prisma.fuelInvestigationAttachment.findUnique({
    where: { id: attachmentId },
    include: { investigation: { select: { companyId: true } } },
  });
  if (!a || a.deletedAt) throw errors.notFound("Файл не найден.");
  assertFuelCompanyAccess(actor, a.investigation.companyId, "FUEL_VIEW");
  return a;
}

export async function listInvestigations(actor: Actor, opts: { status?: string; allCompanies?: boolean }) {
  if (opts.allCompanies && !actor.isAdmin) throw errors.forbidden();
  const where: Prisma.FuelInvestigationWhereInput = {
    ...(opts.allCompanies ? {} : { companyId: fuelScope(actor, "FUEL_VIEW").companyId }),
    ...(opts.status ? { status: opts.status as "OPEN" } : {}),
  };
  return prisma.fuelInvestigation.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      vehicle: { select: { plateNumber: true, make: true, model: true } },
      company: { select: { legalName: true } },
      _count: { select: { anomalies: true, comments: true } },
    },
  });
}
