import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { LoadStatus } from "@/generated/prisma/enums";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requireActiveCompany, requireCompanyPermission, requirePermission, type Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { defaultTimezone } from "@/lib/geo/countries";
import { geocoder } from "@/lib/geo/geocoder";
import { isCarrierRole, isCustomerRole } from "@/lib/permissions";
import { nextPublicNumber } from "@/lib/numbering";
import type { z } from "zod";
import type { loadInputSchema, loadListQuerySchema } from "@/lib/validation/load";
import { requireLoadRelation } from "./access";
import { companyRatings } from "./company.service";
import { CARRIER_OFFICE_ROLES, companyUserIds, notify } from "./notification.service";
import { getSettings } from "./settings.service";

type LoadParsed = z.output<typeof loadInputSchema>;
type ListQuery = z.output<typeof loadListQuerySchema>;

export const EDITABLE_LOAD_STATUSES: LoadStatus[] = ["DRAFT", "PUBLISHED"];
export const CANCELLABLE_LOAD_STATUSES: LoadStatus[] = ["DRAFT", "PUBLISHED", "BIDDING"];

async function buildStops(input: LoadParsed) {
  return Promise.all(
    input.stops.map(async (s, i) => {
      let { latitude, longitude } = s;
      if (latitude === null || longitude === null) {
        const point = await geocoder.geocodeCity(s.country, s.city);
        if (point) ({ latitude, longitude } = point);
      }
      const fullAddress = s.fullAddress ?? [s.street, s.building, s.city, s.region, s.postalCode].filter(Boolean).join(", ") ?? null;
      return {
        sequence: i + 1,
        type: s.type,
        country: s.country,
        region: s.region,
        city: s.city,
        street: s.street,
        building: s.building,
        postalCode: s.postalCode,
        fullAddress: fullAddress || null,
        latitude,
        longitude,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
        plannedDateFrom: s.plannedDateFrom,
        plannedDateTo: s.plannedDateTo,
        timezone: s.timezone ?? defaultTimezone(s.country),
        notes: s.notes,
      };
    }),
  );
}

function derivedFields(input: LoadParsed) {
  const first = input.stops[0];
  const last = input.stops[input.stops.length - 1];
  return {
    loadingDateFrom: first.plannedDateFrom!,
    loadingDateTo: first.plannedDateTo,
    deliveryDateFrom: last.plannedDateFrom,
    deliveryDateTo: last.plannedDateTo,
    originCountry: first.country,
    originCity: first.city,
    destinationCountry: last.country,
    destinationCity: last.city,
  };
}

function loadData(input: LoadParsed) {
  return {
    title: input.title,
    clientName: input.clientName,
    cargoType: input.cargoType,
    cargoDescription: input.cargoDescription,
    weightKg: input.weightKg,
    volumeM3: input.volumeM3,
    packagesCount: input.packagesCount,
    packageType: input.packageType,
    vehicleType: input.vehicleType,
    bodyType: input.bodyType,
    temperatureFrom: input.temperatureFrom,
    temperatureTo: input.temperatureTo,
    requiresGps: input.requiresGps,
    requirements: input.requirements,
    priceType: input.priceType,
    targetPrice: input.priceType === "REQUEST_QUOTE" ? null : input.targetPrice,
    currency: input.currency,
    additionalTerms: input.additionalTerms,
    notes: input.notes,
    ...derivedFields(input),
  };
}

async function validateInvitees(tx: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  const carriers = await tx.company.findMany({
    where: { id: { in: ids }, type: "CARRIER", deletedAt: null },
    select: { id: true },
  });
  if (carriers.length !== new Set(ids).size) {
    throw errors.validation("Некоторые из выбранных перевозчиков не найдены.", { invitedCarrierIds: ["Проверьте список"] });
  }
  return carriers.map((c) => c.id);
}

function assertCustomerCompany(actor: Actor) {
  const m = requireActiveCompany(actor);
  if (!isCustomerRole(m.role)) {
    throw errors.forbidden("Создавать и публиковать грузы могут только грузовладельцы и экспедиторы.");
  }
  return m;
}

export async function createLoad(actor: Actor, input: LoadParsed, opts: { publish: boolean }) {
  requirePermission(actor, "LOAD_CREATE", "Создавать грузы могут только грузовладельцы и экспедиторы.");
  const membership = assertCustomerCompany(actor);
  if (opts.publish) requirePermission(actor, "LOAD_PUBLISH");
  const stops = await buildStops(input);

  return prisma.$transaction(async (tx) => {
    const invitees = await validateInvitees(tx, input.visibility === "INVITE_ONLY" ? input.invitedCarrierIds : []);
    const publicNumber = await nextPublicNumber(tx, "load");
    const load = await tx.load.create({
      data: {
        ...loadData(input),
        publicNumber,
        companyId: membership.companyId,
        createdByUserId: actor.userId,
        status: "DRAFT",
        visibility: "DRAFT",
        stops: { create: stops },
        invitations: { create: invitees.map((carrierCompanyId) => ({ carrierCompanyId })) },
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.LOAD_CREATED,
        entityType: "Load",
        entityId: load.id,
        companyId: membership.companyId,
        newValue: { publicNumber, title: load.title },
      },
      tx,
    );
    if (opts.publish) await publishInTx(tx, actor, load.id);
    return tx.load.findUniqueOrThrow({ where: { id: load.id }, select: { id: true, publicNumber: true, status: true } });
  });
}

export async function updateLoad(actor: Actor, loadId: string, input: LoadParsed) {
  const { load, relation } = await requireLoadRelation(actor, loadId);
  if (relation !== "OWNER") throw errors.forbidden("Редактировать груз может только его владелец.");
  requireCompanyPermission(actor, load.companyId, "LOAD_EDIT");
  const stops = await buildStops(input);

  return prisma.$transaction(async (tx) => {
    await lockLoad(tx, loadId);
    const current = await tx.load.findUniqueOrThrow({ where: { id: loadId }, include: { stops: true } });
    if (current.status === "BIDDING") {
      throw new AppError("INVALID_STATE_TRANSITION", "Груз нельзя изменить: по нему уже есть предложения. Отмените груз и создайте новый.");
    }
    if (!EDITABLE_LOAD_STATUSES.includes(current.status)) {
      throw new AppError("INVALID_STATE_TRANSITION", "Груз в текущем статусе изменить нельзя.");
    }
    const invitees = await validateInvitees(tx, input.visibility === "INVITE_ONLY" ? input.invitedCarrierIds : []);
    await tx.loadStop.deleteMany({ where: { loadId } });
    await tx.loadInvitation.deleteMany({ where: { loadId } });
    const updated = await tx.load.update({
      where: { id: loadId },
      data: {
        ...loadData(input),
        visibility: current.status === "DRAFT" ? "DRAFT" : invitees.length ? "INVITE_ONLY" : "MARKETPLACE",
        stops: { create: stops },
        invitations: { create: invitees.map((carrierCompanyId) => ({ carrierCompanyId })) },
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.LOAD_UPDATED,
        entityType: "Load",
        entityId: loadId,
        companyId: load.companyId,
        oldValue: {
          title: current.title,
          weightKg: current.weightKg,
          targetPrice: current.targetPrice,
          currency: current.currency,
          route: current.stops.map((s) => s.city),
        },
        newValue: {
          title: updated.title,
          weightKg: updated.weightKg,
          targetPrice: updated.targetPrice,
          currency: updated.currency,
          route: stops.map((s) => s.city),
        },
      },
      tx,
    );
    return { id: updated.id, publicNumber: updated.publicNumber, status: updated.status };
  });
}

async function lockLoad(tx: Tx, loadId: string) {
  await tx.$queryRaw`SELECT id FROM "Load" WHERE id = ${loadId}::uuid FOR UPDATE`;
}

async function publishInTx(tx: Tx, actor: Actor, loadId: string) {
  await lockLoad(tx, loadId);
  const load = await tx.load.findUniqueOrThrow({
    where: { id: loadId },
    include: { stops: { orderBy: { sequence: "asc" } }, invitations: true, company: true },
  });
  if (load.status !== "DRAFT") {
    if (load.status === "PUBLISHED" || load.status === "BIDDING") throw new AppError("DUPLICATE_ACTION", "Груз уже опубликован.");
    throw new AppError("INVALID_STATE_TRANSITION", "Опубликовать можно только черновик.");
  }
  const settings = await getSettings(tx);
  if (settings.restrictedCargoTypes.includes(load.cargoType)) {
    throw new AppError("FORBIDDEN", "Публикация грузов этого типа временно ограничена администратором платформы.");
  }
  if (settings.requireVerifiedToPublish && load.company.verificationStatus !== "VERIFIED") {
    throw new AppError("FORBIDDEN", "Публикация доступна только проверенным компаниям. Пройдите верификацию в разделе «Компания».");
  }
  if (load.company.verificationStatus === "SUSPENDED") {
    throw new AppError("FORBIDDEN", "Деятельность компании приостановлена администратором.");
  }
  const pickup = load.stops.find((s) => s.type === "PICKUP");
  const delivery = [...load.stops].reverse().find((s) => s.type === "DELIVERY");
  if (!pickup || !delivery) throw errors.validation("Нельзя опубликовать груз без адреса загрузки и адреса доставки.");
  if (!(Number(load.weightKg) > 0)) throw errors.validation("Нельзя опубликовать груз без веса.");
  const latestLoading = load.loadingDateTo ?? load.loadingDateFrom;
  if (latestLoading.getTime() < Date.now() - 24 * 60 * 60_000) {
    throw errors.validation("Дата загрузки уже прошла. Измените даты перед публикацией.");
  }
  const visibility = load.invitations.length > 0 ? "INVITE_ONLY" : "MARKETPLACE";
  await tx.load.update({ where: { id: loadId }, data: { status: "PUBLISHED", visibility, publishedAt: new Date() } });
  await audit(
    actor,
    {
      action: AuditAction.LOAD_PUBLISHED,
      entityType: "Load",
      entityId: loadId,
      companyId: load.companyId,
      oldValue: { status: "DRAFT" },
      newValue: { status: "PUBLISHED", visibility },
    },
    tx,
  );

  await notify(tx, {
    userIds: [actor.userId],
    type: "LOAD_PUBLISHED",
    title: `Груз ${load.publicNumber} опубликован`,
    body: `${load.originCity} → ${load.destinationCity}. Перевозчики уже могут предлагать цену.`,
    entityType: "Load",
    entityId: loadId,
    link: `/loads/${loadId}`,
  });
  if (visibility === "INVITE_ONLY") {
    for (const inv of load.invitations) {
      await notify(tx, {
        userIds: await companyUserIds(tx, inv.carrierCompanyId, CARRIER_OFFICE_ROLES),
        type: "LOAD_PUBLISHED",
        title: `Вас пригласили на груз ${load.publicNumber}`,
        body: `${load.originCity} → ${load.destinationCity}`,
        entityType: "Load",
        entityId: loadId,
        link: `/loads/${loadId}`,
      });
    }
  }
}

export async function publishLoad(actor: Actor, loadId: string) {
  const { relation, load } = await requireLoadRelation(actor, loadId);
  if (relation !== "OWNER") throw errors.forbidden("Опубликовать груз может только его владелец.");
  requireCompanyPermission(actor, load.companyId, "LOAD_PUBLISH", "Публиковать грузы могут только грузовладельцы и экспедиторы.");
  await prisma.$transaction((tx) => publishInTx(tx, actor, loadId));
  return prisma.load.findUniqueOrThrow({ where: { id: loadId }, select: { id: true, publicNumber: true, status: true } });
}

export async function cancelLoad(actor: Actor, loadId: string, reason: string | null) {
  const { relation, load: rel } = await requireLoadRelation(actor, loadId);
  if (relation !== "OWNER" && relation !== "ADMIN") throw errors.forbidden("Отменить груз может только его владелец.");
  requireCompanyPermission(actor, rel.companyId, "LOAD_CANCEL");

  return prisma.$transaction(async (tx) => {
    await lockLoad(tx, loadId);
    const load = await tx.load.findUniqueOrThrow({ where: { id: loadId } });
    if (load.status === "CANCELLED") throw new AppError("DUPLICATE_ACTION", "Груз уже отменён.");
    if (!CANCELLABLE_LOAD_STATUSES.includes(load.status)) {
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        "По грузу уже выбран перевозчик — отмените перевозку на странице сделки. После подписания договора отмена выполняется через процедуру спора/администратора.",
      );
    }
    const pending = await tx.bid.findMany({ where: { loadId, status: "PENDING" } });
    if (pending.length) {
      await tx.bid.updateMany({
        where: { loadId, status: "PENDING" },
        data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: actor.userId },
      });
      for (const b of pending) {
        await notify(tx, {
          userIds: await companyUserIds(tx, b.carrierCompanyId, CARRIER_OFFICE_ROLES),
          type: "BID_REJECTED",
          title: `Груз ${load.publicNumber} отменён заказчиком`,
          body: "Ваше предложение закрыто.",
          entityType: "Load",
          entityId: loadId,
          link: `/loads/${loadId}`,
        });
      }
    }
    const updated = await tx.load.update({
      where: { id: loadId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    await audit(
      actor,
      {
        action: AuditAction.LOAD_CANCELLED,
        entityType: "Load",
        entityId: loadId,
        companyId: load.companyId,
        oldValue: { status: load.status },
        newValue: { status: "CANCELLED", reason },
      },
      tx,
    );
    return { id: updated.id, status: updated.status };
  });
}

// ─────────── Чтение ───────────

export async function getLoadDetail(actor: Actor, loadId: string) {
  const { relation, membership } = await requireLoadRelation(actor, loadId);
  const isOwner = relation === "OWNER" || relation === "ADMIN";
  const myCompanyIds = actor.memberships.map((m) => m.companyId);

  const load = await prisma.load.findUniqueOrThrow({
    where: { id: loadId },
    include: {
      stops: { orderBy: { sequence: "asc" } },
      company: { select: { id: true, legalName: true, tradeName: true, verificationStatus: true, country: true, city: true, phone: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      invitations: { include: { carrier: { select: { id: true, legalName: true } } } },
      order: { select: { id: true, publicNumber: true, carrierCompanyId: true } },
      questions: {
        where: isOwner ? {} : { OR: [{ answer: { not: null } }, { companyId: { in: myCompanyIds } }] },
        orderBy: { createdAt: "asc" },
        include: { company: { select: { legalName: true } } },
      },
    },
  });
  const bids = await prisma.bid.findMany({
    where: isOwner ? { loadId } : { loadId, carrierCompanyId: { in: myCompanyIds } },
    orderBy: [{ status: "asc" }, { amount: "asc" }],
    include: {
      carrier: { select: { id: true, legalName: true, verificationStatus: true, country: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } } },
      },
    },
  });
  const ratings = await companyRatings([load.companyId, ...bids.map((b) => b.carrierCompanyId)]);
  const history = isOwner
    ? await prisma.auditLog.findMany({
        where: { entityType: { in: ["Load", "Bid"] }, OR: [{ entityId: loadId }, { entityId: { in: bids.map((b) => b.id) } }] },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } } },
        take: 200,
      })
    : [];
  const orderVisible =
    load.order && (isOwner || actor.memberships.some((m) => m.companyId === load.order!.carrierCompanyId && isCarrierRole(m.role)));

  return {
    load: { ...load, order: orderVisible ? load.order : null },
    bids,
    ratings,
    history,
    relation,
    membershipCompanyId: membership?.companyId ?? null,
  };
}

export async function listLoads(actor: Actor, q: ListQuery) {
  const and: Prisma.LoadWhereInput[] = [{ deletedAt: null }];

  if (q.scope === "mine") {
    const m = requireActiveCompany(actor);
    if (!isCustomerRole(m.role)) throw errors.forbidden();
    and.push({ companyId: m.companyId });
    if (q.status) and.push({ status: q.status as LoadStatus });
  } else {
    if (!actor.permissions.has("MARKETPLACE_VIEW")) throw errors.forbidden("Биржа грузов доступна перевозчикам и экспедиторам.");
    const myCompanyIds = actor.memberships.map((m) => m.companyId);
    and.push({ status: { in: ["PUBLISHED", "BIDDING"] } });
    and.push({
      OR: [{ visibility: "MARKETPLACE" }, { visibility: "INVITE_ONLY", invitations: { some: { carrierCompanyId: { in: myCompanyIds } } } }],
    });
  }
  if (q.q) {
    const s = q.q.trim();
    and.push({
      OR: [
        { publicNumber: { contains: s, mode: "insensitive" } },
        { title: { contains: s, mode: "insensitive" } },
        { stops: { some: { city: { contains: s, mode: "insensitive" } } } },
        { stops: { some: { country: { equals: s.toUpperCase() } } } },
      ],
    });
  }
  if (q.from) and.push({ OR: [{ originCity: { contains: q.from, mode: "insensitive" } }, { originCountry: q.from.toUpperCase() }] });
  if (q.to) and.push({ OR: [{ destinationCity: { contains: q.to, mode: "insensitive" } }, { destinationCountry: q.to.toUpperCase() }] });
  if (q.country) and.push({ stops: { some: { country: q.country.toUpperCase() } } });
  if (q.dateFrom) and.push({ loadingDateFrom: { gte: new Date(q.dateFrom) } });
  if (q.dateTo) and.push({ loadingDateFrom: { lte: new Date(`${q.dateTo}T23:59:59Z`) } });
  if (q.bodyType) and.push({ bodyType: q.bodyType });
  if (q.weightMin !== undefined) and.push({ weightKg: { gte: q.weightMin } });
  if (q.weightMax !== undefined) and.push({ weightKg: { lte: q.weightMax } });
  if (q.priceMin !== undefined) and.push({ targetPrice: { gte: q.priceMin } });
  if (q.priceMax !== undefined) and.push({ targetPrice: { lte: q.priceMax } });
  if (q.currency) and.push({ currency: q.currency });
  if (q.verifiedOnly) and.push({ company: { verificationStatus: "VERIFIED" } });

  const where: Prisma.LoadWhereInput = { AND: and };
  const orderBy: Prisma.LoadOrderByWithRelationInput[] =
    q.sort === "loadingDate"
      ? [{ loadingDateFrom: "asc" }]
      : q.sort === "price"
        ? [{ targetPrice: { sort: "asc", nulls: "last" } }]
        : q.sort === "-price"
          ? [{ targetPrice: { sort: "desc", nulls: "last" } }]
          : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  const myCompanyIds = actor.memberships.map((m) => m.companyId);
  const [items, total] = await Promise.all([
    prisma.load.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        stops: { orderBy: { sequence: "asc" }, select: { sequence: true, type: true, country: true, city: true } },
        company: { select: { id: true, legalName: true, tradeName: true, verificationStatus: true } },
        _count: { select: { bids: { where: { status: "PENDING" } } } },
        bids: { where: { carrierCompanyId: { in: myCompanyIds } }, select: { id: true, status: true, amount: true, currency: true } },
        order: { select: { id: true, publicNumber: true } },
      },
    }),
    prisma.load.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

// ─────────── Вопросы по грузу ───────────

export async function askQuestion(actor: Actor, loadId: string, question: string) {
  const { relation, membership, load } = await requireLoadRelation(actor, loadId);
  if (relation !== "CARRIER" || !membership) throw errors.forbidden("Задавать вопросы по грузу могут перевозчики.");
  requireCompanyPermission(actor, membership.companyId, "LOAD_ASK_QUESTION", "Задавать вопросы по грузу могут перевозчики.");
  return prisma.$transaction(async (tx) => {
    const q = await tx.loadQuestion.create({ data: { loadId, companyId: membership.companyId, askedByUserId: actor.userId, question } });
    const full = await tx.load.findUniqueOrThrow({ where: { id: loadId }, select: { publicNumber: true } });
    await notify(tx, {
      userIds: await companyUserIds(tx, load.companyId, ["SHIPPER", "FORWARDER"]),
      type: "LOAD_QUESTION",
      title: `Вопрос по грузу ${full.publicNumber}`,
      body: question.slice(0, 200),
      entityType: "Load",
      entityId: loadId,
      link: `/loads/${loadId}?tab=conditions`,
    });
    await audit(
      actor,
      {
        action: AuditAction.LOAD_QUESTION_ASKED,
        entityType: "Load",
        entityId: loadId,
        companyId: membership.companyId,
        newValue: { question },
      },
      tx,
    );
    return q;
  });
}

export async function answerQuestion(actor: Actor, questionId: string, answer: string) {
  const q = await prisma.loadQuestion.findUnique({ where: { id: questionId } });
  if (!q) throw errors.notFound("Вопрос не найден.");
  const { relation, load: rel } = await requireLoadRelation(actor, q.loadId);
  if (relation !== "OWNER") throw errors.forbidden("Отвечать на вопросы может владелец груза.");
  requireCompanyPermission(actor, rel.companyId, "LOAD_ANSWER_QUESTION");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.loadQuestion.update({
      where: { id: questionId },
      data: { answer, answeredByUserId: actor.userId, answeredAt: new Date() },
    });
    const load = await tx.load.findUniqueOrThrow({ where: { id: q.loadId }, select: { publicNumber: true } });
    await notify(tx, {
      userIds: [q.askedByUserId],
      type: "LOAD_QUESTION",
      title: `Ответ по грузу ${load.publicNumber}`,
      body: answer.slice(0, 200),
      entityType: "Load",
      entityId: q.loadId,
      link: `/loads/${q.loadId}?tab=conditions`,
    });
    await audit(actor, { action: AuditAction.LOAD_QUESTION_ANSWERED, entityType: "Load", entityId: q.loadId, newValue: { answer } }, tx);
    return updated;
  });
}

/** Данные груза для формы редактирования. */
export async function getLoadForEdit(actor: Actor, loadId: string) {
  const { relation, load } = await requireLoadRelation(actor, loadId);
  if (relation !== "OWNER") throw errors.forbidden("Редактировать груз может только его владелец.");
  requireCompanyPermission(actor, load.companyId, "LOAD_EDIT");
  return prisma.load.findUniqueOrThrow({
    where: { id: loadId },
    include: { stops: { orderBy: { sequence: "asc" } }, invitations: true },
  });
}

/** Перевозчики для приглашения (INVITE_ONLY). */
export async function listCarrierOptions() {
  return prisma.company.findMany({
    where: { type: "CARRIER", deletedAt: null, verificationStatus: { not: "SUSPENDED" } },
    select: { id: true, legalName: true, verificationStatus: true, country: true, city: true },
    orderBy: [{ verificationStatus: "asc" }, { legalName: "asc" }],
    take: 200,
  });
}

// ─────────── Документы груза ───────────

export async function uploadLoadDocument(actor: Actor, loadId: string, type: import("@/generated/prisma/enums").DocumentType, file: File) {
  const { relation, load } = await requireLoadRelation(actor, loadId);
  if (relation !== "OWNER") throw errors.forbidden("Загружать документы груза может его владелец.");
  requireCompanyPermission(actor, load.companyId, "LOAD_EDIT");
  if (load.status === "CANCELLED") throw new AppError("DOCUMENT_NOT_ALLOWED", "Груз отменён.");
  const { validateUpload } = await import("@/lib/storage/file-validation");
  const { storage, buildStorageKey } = await import("@/lib/storage/storage");
  const v = await validateUpload(file);
  const key = buildStorageKey(`loads/${loadId}`, v.ext);
  await storage().put(key, v.buffer, v.mimeType);
  return prisma.$transaction(async (tx) => {
    const doc = await tx.loadDocument.create({
      data: { loadId, uploadedByUserId: actor.userId, type, filename: v.filename, mimeType: v.mimeType, size: v.size, storageKey: key },
    });
    await audit(
      actor,
      {
        action: AuditAction.DOCUMENT_UPLOADED,
        entityType: "Load",
        entityId: loadId,
        companyId: load.companyId,
        newValue: { documentId: doc.id, filename: v.filename, type },
      },
      tx,
    );
    return doc;
  });
}

export async function getLoadDocumentFile(actor: Actor, documentId: string) {
  const doc = await prisma.loadDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) throw errors.notFound("Документ не найден.");
  await requireLoadRelation(actor, doc.loadId);
  return doc;
}

export async function deleteLoadDocument(actor: Actor, documentId: string) {
  const doc = await prisma.loadDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) throw errors.notFound("Документ не найден.");
  const { relation, load } = await requireLoadRelation(actor, doc.loadId);
  if (relation !== "OWNER") throw errors.forbidden("Удалить документ может владелец груза.");
  requireCompanyPermission(actor, load.companyId, "LOAD_EDIT");
  return prisma.$transaction(async (tx) => {
    await tx.loadDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await audit(
      actor,
      {
        action: AuditAction.DOCUMENT_DELETED,
        entityType: "Load",
        entityId: doc.loadId,
        companyId: load.companyId,
        oldValue: { documentId, filename: doc.filename },
      },
      tx,
    );
    return { ok: true };
  });
}
