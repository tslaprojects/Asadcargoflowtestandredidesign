import "server-only";
import { randomUUID } from "node:crypto";
import type { DocumentType } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { label } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import { validateUpload } from "@/lib/storage/file-validation";
import { buildStorageKey, storage } from "@/lib/storage/storage";
import { FINAL_STATUSES } from "@/lib/state-machine/order-state-machine";
import { ordersWhereForActor, requireOrderAccess, type OrderAccess } from "./access";
import { notify } from "./notification.service";
import { orderParticipantUserIds } from "./order-core";

/** Типы документов, доступные водителю (без финансовых и договорных). */
export const DRIVER_DOCUMENT_TYPES: DocumentType[] = [
  "CMR",
  "CARGO_PHOTO",
  "SEAL_PHOTO",
  "PROOF_OF_DELIVERY",
  "DRIVER_DOCUMENT",
  "VEHICLE_DOCUMENT",
  "OTHER",
];

function visibleTypesFor(access: OrderAccess): DocumentType[] | null {
  return access.side === "DRIVER" ? DRIVER_DOCUMENT_TYPES : null;
}

export async function listOrderDocuments(
  actor: Actor,
  orderId: string,
  opts: { includeHistory?: boolean; page?: number; pageSize?: number } = {},
) {
  const { access } = await requireOrderAccess(actor, orderId, "DOCUMENT_VIEW");
  const types = visibleTypesFor(access);
  const where = {
    orderId,
    status: opts.includeHistory ? { in: ["ACTIVE" as const, "SUPERSEDED" as const] } : ("ACTIVE" as const),
    ...(types ? { type: { in: types } } : {}),
  };
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const [items, total] = await Promise.all([
    prisma.orderDocument.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.orderDocument.count({ where }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.uploadedByUserId))] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const companyId = access.membership?.companyId ?? null;
  return {
    items: items.map((d) => ({
      ...d,
      uploadedByName: names[d.uploadedByUserId] ?? "—",
      canDelete: d.status === "ACTIVE" && (access.side === "ADMIN" || (access.can("DOCUMENT_DELETE") && d.uploadedCompanyId === companyId)),
    })),
    total,
    page,
    pageSize,
  };
}

export async function uploadOrderDocument(
  actor: Actor,
  orderId: string,
  input: { type: DocumentType; file: File; note?: string | null; replacesId?: string | null },
) {
  const { access, order } = await requireOrderAccess(actor, orderId, "DOCUMENT_UPLOAD");
  if (FINAL_STATUSES.includes(order.currentStatus) && access.side !== "ADMIN") {
    throw new AppError("DOCUMENT_NOT_ALLOWED", "Нельзя загрузить документ в закрытую или отменённую перевозку.");
  }
  if (access.side === "DRIVER" && !DRIVER_DOCUMENT_TYPES.includes(input.type)) {
    throw new AppError("DOCUMENT_NOT_ALLOWED", "Водитель может загружать только CMR, фото и документы рейса.");
  }
  if (input.type === "CONTRACT") {
    throw new AppError("DOCUMENT_NOT_ALLOWED", "Договор формируется платформой автоматически.");
  }
  const imagesOnly = input.type === "CARGO_PHOTO" || input.type === "SEAL_PHOTO";
  const file = await validateUpload(input.file, { imagesOnly });
  const key = buildStorageKey(`orders/${orderId}`, file.ext);
  await storage().put(key, file.buffer, file.mimeType);

  try {
    return await prisma.$transaction(async (tx) => {
      let groupId: string = randomUUID();
      let version = 1;
      if (input.replacesId) {
        const prev = await tx.orderDocument.findUnique({ where: { id: input.replacesId } });
        if (!prev || prev.orderId !== orderId || prev.status !== "ACTIVE") throw errors.notFound("Исходный документ не найден.");
        if (access.side !== "ADMIN" && prev.uploadedCompanyId !== access.membership?.companyId) {
          throw errors.forbidden("Новую версию может загрузить только компания, загрузившая документ.");
        }
        await tx.orderDocument.update({ where: { id: prev.id }, data: { status: "SUPERSEDED" } });
        groupId = prev.groupId;
        version = prev.version + 1;
      }
      const doc = await tx.orderDocument.create({
        data: {
          orderId,
          uploadedByUserId: actor.userId,
          uploadedCompanyId: access.membership?.companyId ?? null,
          type: input.type,
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          storageKey: key,
          version,
          groupId,
          note: input.note ?? null,
        },
      });
      await audit(
        actor,
        {
          action: AuditAction.DOCUMENT_UPLOADED,
          entityType: "OrderDocument",
          entityId: doc.id,
          companyId: access.membership?.companyId ?? null,
          newValue: { orderId, type: input.type, filename: file.filename, version },
        },
        tx,
      );
      const fullOrder = await tx.transportOrder.findUniqueOrThrow({ where: { id: orderId } });
      await notify(tx, {
        userIds: await orderParticipantUserIds(tx, fullOrder, { customer: true, carrier: true, driver: false }),
        excludeUserId: actor.userId,
        type: "NEW_DOCUMENT",
        title: `${fullOrder.publicNumber}: новый документ`,
        body: `${label("DocumentType", input.type)} — ${file.filename}${version > 1 ? ` (версия ${version})` : ""}`,
        entityType: "TransportOrder",
        entityId: orderId,
        link: `/orders/${orderId}?tab=documents`,
      });
      return doc;
    });
  } catch (e) {
    await storage()
      .delete(key)
      .catch((err) => logger.warn("storage.cleanup_failed", { error: err }));
    throw e;
  }
}

export async function getDocumentForDownload(actor: Actor, documentId: string) {
  const doc = await prisma.orderDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.status === "DELETED") throw errors.notFound("Документ не найден.");
  const { access } = await requireOrderAccess(actor, doc.orderId, "DOCUMENT_VIEW");
  const types = visibleTypesFor(access);
  if (types && !types.includes(doc.type)) throw errors.forbidden("У вас нет доступа к этому документу.");
  await audit(actor, {
    action: AuditAction.DOCUMENT_DOWNLOADED,
    entityType: "OrderDocument",
    entityId: doc.id,
    companyId: access.membership?.companyId ?? null,
    newValue: { orderId: doc.orderId },
  });
  return doc;
}

export async function deleteOrderDocument(actor: Actor, documentId: string) {
  const doc = await prisma.orderDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.status === "DELETED") throw errors.notFound("Документ не найден.");
  const { access, order } = await requireOrderAccess(actor, doc.orderId, "DOCUMENT_DELETE");
  if (access.side !== "ADMIN") {
    if (doc.uploadedCompanyId !== access.membership?.companyId)
      throw errors.forbidden("Удалить документ может только загрузившая его компания.");
    if (FINAL_STATUSES.includes(order.currentStatus))
      throw new AppError("DOCUMENT_NOT_ALLOWED", "Документы закрытой перевозки удалять нельзя.");
    // Во время спора или паузы документы — доказательства: удалять их может только администратор
    if (order.currentStatus === "DISPUTED" || order.currentStatus === "ON_HOLD") {
      throw new AppError("DOCUMENT_NOT_ALLOWED", "Во время спора или приостановки документы перевозки удалять нельзя.");
    }
    const full = await prisma.transportOrder.findUniqueOrThrow({ where: { id: doc.orderId }, select: { deliveredAt: true } });
    if (full.deliveredAt && (doc.type === "PROOF_OF_DELIVERY" || doc.type === "CMR")) {
      throw new AppError("DOCUMENT_NOT_ALLOWED", "Подтверждение доставки нельзя удалить после отметки о доставке. Загрузите новую версию.");
    }
  }
  if (doc.status !== "ACTIVE") throw new AppError("DOCUMENT_NOT_ALLOWED", "Удалить можно только актуальную версию документа.");
  return prisma.$transaction(async (tx) => {
    await tx.orderDocument.update({
      where: { id: documentId },
      data: { status: "DELETED", deletedAt: new Date(), deletedByUserId: actor.userId },
    });
    // Восстанавливаем предыдущую версию как актуальную
    const prev = await tx.orderDocument.findFirst({ where: { groupId: doc.groupId, status: "SUPERSEDED" }, orderBy: { version: "desc" } });
    if (prev) await tx.orderDocument.update({ where: { id: prev.id }, data: { status: "ACTIVE" } });
    await audit(
      actor,
      {
        action: AuditAction.DOCUMENT_DELETED,
        entityType: "OrderDocument",
        entityId: documentId,
        companyId: access.membership?.companyId ?? null,
        oldValue: { orderId: doc.orderId, filename: doc.filename, type: doc.type, version: doc.version },
      },
      tx,
    );
    return { ok: true, restoredVersionId: prev?.id ?? null };
  });
}

/** Все документы по сделкам пользователя (раздел «Документы»). */
export async function listMyDocuments(actor: Actor, opts: { page: number; pageSize: number; type?: DocumentType; q?: string }) {
  const orderWhere = ordersWhereForActor(actor);
  const driverOnly = !actor.isAdmin && actor.memberships.every((m) => m.role === "DRIVER");
  const where = {
    status: "ACTIVE" as const,
    order: orderWhere,
    ...(driverOnly || opts.type
      ? {
          type: {
            in: (opts.type ? [opts.type] : DRIVER_DOCUMENT_TYPES).filter((t) => !driverOnly || DRIVER_DOCUMENT_TYPES.includes(t)),
          },
        }
      : {}),
    ...(opts.q
      ? {
          OR: [
            { filename: { contains: opts.q, mode: "insensitive" as const } },
            { order: { publicNumber: { contains: opts.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.orderDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { order: { select: { id: true, publicNumber: true } } },
    }),
    prisma.orderDocument.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}
