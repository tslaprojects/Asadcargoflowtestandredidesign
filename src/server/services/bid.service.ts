import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import { requireCompanyPermission, type Actor } from "@/lib/auth/actor";
import { prisma, type Tx } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { formatMoney, toMinor } from "@/lib/money";
import { nextPublicNumber } from "@/lib/numbering";
import { isCarrierRole } from "@/lib/permissions";
import { isBidExpired, isLoadStale, loadAcceptsBids, type bidCreateSchema } from "@/lib/validation/bid";
import { requireLoadRelation } from "./access";
import { createContractInTx } from "./contract.service";
import { CARRIER_OFFICE_ROLES, companyUserIds, CUSTOMER_ROLES, notify } from "./notification.service";
import { performTransitionInTx } from "./order-core";
import { getSettings } from "./settings.service";

type BidCreate = z.output<typeof bidCreateSchema>;

async function lockLoad(tx: Tx, loadId: string) {
  await tx.$queryRaw`SELECT id FROM "Load" WHERE id = ${loadId}::uuid FOR UPDATE`;
}

/**
 * Самосделка: у компании-заказчика и компании-перевозчика есть общий пользователь.
 * Такие сделки позволяют накручивать рейтинг и обороты, поэтому запрещены.
 */
async function assertNotSelfDealing(tx: Tx, customerCompanyId: string, carrierCompanyId: string) {
  const shared = await tx.companyMember.findFirst({
    where: { companyId: customerCompanyId, user: { memberships: { some: { companyId: carrierCompanyId } } } },
    select: { id: true },
  });
  if (shared) throw errors.forbidden("Нельзя заключать сделку между компаниями, в которых состоит один и тот же пользователь.");
}

/** Помечает просроченные ставки как EXPIRED (ленивая актуализация). */
export async function expireStaleBids(tx: Tx = prisma, loadId?: string) {
  const res = await tx.bid.updateMany({
    where: { status: "PENDING", validUntil: { lt: new Date() }, ...(loadId ? { loadId } : {}) },
    data: { status: "EXPIRED" },
  });
  if (res.count === 0) return;
  // Груз без активных предложений снова открыт для торгов и редактирования
  if (loadId) {
    await tx.$executeRaw`UPDATE "Load" SET status = 'PUBLISHED', "updatedAt" = now()
      WHERE id = ${loadId}::uuid AND status = 'BIDDING'
        AND NOT EXISTS (SELECT 1 FROM "Bid" b WHERE b."loadId" = "Load".id AND b.status = 'PENDING')`;
  } else {
    await tx.$executeRaw`UPDATE "Load" SET status = 'PUBLISHED', "updatedAt" = now()
      WHERE status = 'BIDDING'
        AND NOT EXISTS (SELECT 1 FROM "Bid" b WHERE b."loadId" = "Load".id AND b.status = 'PENDING')`;
  }
}

function loadClosedMessage(status: string) {
  if (status === "CANCELLED") return "Груз отменён заказчиком — предложения не принимаются.";
  if (status === "CARRIER_SELECTED" || status === "CONVERTED_TO_ORDER") return "По грузу уже выбран перевозчик.";
  return "Груз ещё не опубликован.";
}

export async function createBid(actor: Actor, loadId: string, input: BidCreate) {
  const { relation, membership } = await requireLoadRelation(actor, loadId);
  if (relation !== "CARRIER" || !membership || !isCarrierRole(membership.role)) {
    throw errors.forbidden("Предлагать цену могут только перевозчики.");
  }
  requireCompanyPermission(actor, membership.companyId, "BID_CREATE", "Предлагать цену могут только перевозчики.");
  if (membership.company.verificationStatus === "SUSPENDED") throw errors.forbidden("Деятельность компании приостановлена.");
  if (input.validUntil && input.validUntil < new Date()) {
    throw errors.validation("Срок действия предложения уже истёк.", { validUntil: ["Укажите дату в будущем"] });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await lockLoad(tx, loadId);
      await expireStaleBids(tx, loadId);
      const load = await tx.load.findUniqueOrThrow({ where: { id: loadId } });
      if (!loadAcceptsBids(load.status)) throw new AppError("INVALID_STATE_TRANSITION", loadClosedMessage(load.status));
      const settings = await getSettings(tx);
      if (settings.requireVerifiedToBid && membership.company.verificationStatus !== "VERIFIED") {
        throw errors.forbidden("Предлагать цену могут только проверенные перевозчики. Пройдите проверку в разделе «Компания».");
      }
      // Сделка заключается в валюте груза; при фиксированной цене перевозчик соглашается с ценой заказчика
      if (input.currency !== load.currency) {
        throw errors.validation(`Предложение должно быть в валюте груза (${load.currency}).`, { currency: ["Валюта груза"] });
      }
      if (load.priceType === "FIXED" && load.targetPrice && toMinor(input.amount) !== toMinor(Number(load.targetPrice))) {
        throw errors.validation(`Цена груза фиксированная: ${formatMoney(Number(load.targetPrice), load.currency)}.`, {
          amount: ["Фиксированная цена заказчика"],
        });
      }
      if (isLoadStale(load))
        throw new AppError("INVALID_STATE_TRANSITION", "Дата загрузки по грузу уже прошла — предложения не принимаются.");
      if (load.companyId === membership.companyId) throw errors.forbidden("Нельзя предлагать цену на собственный груз.");
      await assertNotSelfDealing(tx, load.companyId, membership.companyId);

      const active = await tx.bid.findFirst({ where: { loadId, carrierCompanyId: membership.companyId, status: "PENDING" } });
      if (active) {
        throw new AppError(
          "BID_ALREADY_EXISTS",
          "У вашей компании уже есть активное предложение по этому грузу. Отзовите его, чтобы отправить новое.",
        );
      }
      const bid = await tx.bid.create({
        data: {
          loadId,
          carrierCompanyId: membership.companyId,
          createdByUserId: actor.userId,
          amount: input.amount,
          currency: input.currency,
          comment: input.comment,
          terms: input.terms,
          readyDate: input.readyDate,
          validUntil: input.validUntil,
          awaitingSide: "CUSTOMER",
          messages: {
            create: {
              authorUserId: actor.userId,
              authorCompanyId: membership.companyId,
              side: "CARRIER",
              type: "OFFER",
              amount: input.amount,
              currency: input.currency,
              message: input.comment,
            },
          },
        },
      });
      if (load.status === "PUBLISHED") await tx.load.update({ where: { id: loadId }, data: { status: "BIDDING" } });
      await audit(
        actor,
        {
          action: AuditAction.BID_CREATED,
          entityType: "Bid",
          entityId: bid.id,
          companyId: membership.companyId,
          newValue: { loadId, amount: input.amount, currency: input.currency },
        },
        tx,
      );
      await notify(tx, {
        userIds: await companyUserIds(tx, load.companyId, CUSTOMER_ROLES),
        type: "NEW_BID",
        title: `Новое предложение по грузу ${load.publicNumber}`,
        body: `${membership.company.legalName} предлагает ${formatMoney(input.amount, input.currency)}.`,
        entityType: "Load",
        entityId: loadId,
        link: `/loads/${loadId}?tab=bids`,
      });
      return bid;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("BID_ALREADY_EXISTS", "У вашей компании уже есть активное предложение по этому грузу.");
    }
    throw e;
  }
}

async function loadBidForCustomer(actor: Actor, bidId: string) {
  const bid = await prisma.bid.findUnique({ where: { id: bidId }, select: { id: true, loadId: true } });
  if (!bid) throw errors.notFound("Предложение не найдено.");
  const { relation, membership } = await requireLoadRelation(actor, bid.loadId);
  if (relation !== "OWNER" || !membership) {
    throw errors.forbidden("Управлять предложениями может только владелец груза.");
  }
  return { bidId: bid.id, loadId: bid.loadId, membership };
}

async function loadBidForCarrier(actor: Actor, bidId: string) {
  const bid = await prisma.bid.findUnique({ where: { id: bidId }, select: { id: true, loadId: true, carrierCompanyId: true } });
  if (!bid) throw errors.notFound("Предложение не найдено.");
  const membership = actor.memberships.find((m) => m.companyId === bid.carrierCompanyId && isCarrierRole(m.role));
  if (!membership) throw errors.forbidden("Это предложение другой компании.");
  return { ...bid, membership };
}

/** Встречное предложение заказчика. История переговоров сохраняется в BidMessage. */
export async function counterBid(actor: Actor, bidId: string, amount: number, message: string | null) {
  const { loadId, membership } = await loadBidForCustomer(actor, bidId);
  requireCompanyPermission(actor, membership.companyId, "BID_COUNTER");
  return prisma.$transaction(async (tx) => {
    await lockLoad(tx, loadId);
    const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId }, include: { load: true } });
    if (bid.status !== "PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Предложение уже неактивно.");
    if (isBidExpired(bid)) throw new AppError("INVALID_STATE_TRANSITION", "Срок действия предложения истёк.");
    if (!loadAcceptsBids(bid.load.status)) throw new AppError("INVALID_STATE_TRANSITION", loadClosedMessage(bid.load.status));
    if (Number(bid.amount) === amount) throw errors.validation("Встречная цена совпадает с текущим предложением — просто примите его.");
    const updated = await tx.bid.update({ where: { id: bidId }, data: { counterAmount: amount, awaitingSide: "CARRIER" } });
    await tx.bidMessage.create({
      data: {
        bidId,
        authorUserId: actor.userId,
        authorCompanyId: membership.companyId,
        side: "CUSTOMER",
        type: "COUNTER",
        amount,
        currency: bid.currency,
        message,
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.BID_COUNTERED,
        entityType: "Bid",
        entityId: bidId,
        companyId: membership.companyId,
        oldValue: { amount: bid.amount },
        newValue: { counterAmount: amount },
      },
      tx,
    );
    await notify(tx, {
      userIds: await companyUserIds(tx, bid.carrierCompanyId, CARRIER_OFFICE_ROLES),
      type: "BID_COUNTERED",
      title: `Встречное предложение по грузу ${bid.load.publicNumber}`,
      body: `Заказчик предлагает ${formatMoney(amount, bid.currency)} вместо ${formatMoney(Number(bid.amount), bid.currency)}.`,
      entityType: "Load",
      entityId: loadId,
      link: `/loads/${loadId}?tab=bids`,
    });
    return updated;
  });
}

/** Ответ перевозчика на встречное предложение: согласиться с ценой заказчика или предложить новую. */
export async function respondToCounter(
  actor: Actor,
  bidId: string,
  input: { action: "agree"; message: string | null } | { action: "propose"; amount: number; message: string | null },
) {
  const { loadId, membership } = await loadBidForCarrier(actor, bidId);
  requireCompanyPermission(actor, membership.companyId, "BID_CREATE");
  return prisma.$transaction(async (tx) => {
    await lockLoad(tx, loadId);
    const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId }, include: { load: true } });
    if (bid.status !== "PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Предложение уже неактивно.");
    if (isBidExpired(bid)) throw new AppError("INVALID_STATE_TRANSITION", "Срок действия предложения истёк.");
    if (!loadAcceptsBids(bid.load.status)) throw new AppError("INVALID_STATE_TRANSITION", loadClosedMessage(bid.load.status));
    // Отвечать можно только на встречное предложение заказчика: менять цену «втихую» перед принятием нельзя
    if (bid.awaitingSide !== "CARRIER" || bid.counterAmount === null) {
      throw new AppError(
        "INVALID_STATE_TRANSITION",
        "Заказчик не делал встречного предложения. Чтобы изменить цену, отзовите предложение и отправьте новое.",
      );
    }
    let newAmount: number;
    if (input.action === "agree") {
      newAmount = Number(bid.counterAmount);
    } else {
      newAmount = input.amount;
    }
    const updated = await tx.bid.update({
      where: { id: bidId },
      data: { amount: newAmount, counterAmount: null, awaitingSide: "CUSTOMER" },
    });
    await tx.bidMessage.create({
      data: {
        bidId,
        authorUserId: actor.userId,
        authorCompanyId: membership.companyId,
        side: "CARRIER",
        type: "OFFER",
        amount: newAmount,
        currency: bid.currency,
        message: input.message ?? (input.action === "agree" ? "Согласны с вашей ценой" : null),
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.BID_UPDATED,
        entityType: "Bid",
        entityId: bidId,
        companyId: membership.companyId,
        oldValue: { amount: bid.amount, counterAmount: bid.counterAmount },
        newValue: { amount: newAmount },
      },
      tx,
    );
    await notify(tx, {
      userIds: await companyUserIds(tx, bid.load.companyId, CUSTOMER_ROLES),
      type: "NEW_BID",
      title:
        input.action === "agree"
          ? `Перевозчик согласен на вашу цену (${bid.load.publicNumber})`
          : `Новая цена перевозчика (${bid.load.publicNumber})`,
      body: `${membership.company.legalName}: ${formatMoney(newAmount, bid.currency)}. Примите предложение, чтобы оформить сделку.`,
      entityType: "Load",
      entityId: loadId,
      link: `/loads/${loadId}?tab=bids`,
    });
    return updated;
  });
}

export async function withdrawBid(actor: Actor, bidId: string) {
  const { loadId, membership } = await loadBidForCarrier(actor, bidId);
  requireCompanyPermission(actor, membership.companyId, "BID_WITHDRAW");
  return prisma.$transaction(async (tx) => {
    await lockLoad(tx, loadId);
    const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId }, include: { load: true } });
    if (bid.status === "WITHDRAWN") throw new AppError("DUPLICATE_ACTION", "Предложение уже отозвано.");
    if (bid.status !== "PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Отозвать можно только активное предложение.");
    const updated = await tx.bid.update({
      where: { id: bidId },
      data: { status: "WITHDRAWN", decidedAt: new Date(), decidedByUserId: actor.userId },
    });
    await tx.bidMessage.create({
      data: { bidId, authorUserId: actor.userId, authorCompanyId: membership.companyId, side: "CARRIER", type: "WITHDRAWN" },
    });
    const stillActive = await tx.bid.count({ where: { loadId, status: "PENDING" } });
    if (stillActive === 0 && bid.load.status === "BIDDING") await tx.load.update({ where: { id: loadId }, data: { status: "PUBLISHED" } });
    await audit(
      actor,
      {
        action: AuditAction.BID_WITHDRAWN,
        entityType: "Bid",
        entityId: bidId,
        companyId: membership.companyId,
        oldValue: { status: "PENDING" },
        newValue: { status: "WITHDRAWN" },
      },
      tx,
    );
    return updated;
  });
}

export async function rejectBid(actor: Actor, bidId: string, reason: string | null) {
  const { loadId, membership } = await loadBidForCustomer(actor, bidId);
  requireCompanyPermission(actor, membership.companyId, "BID_REJECT");
  return prisma.$transaction(async (tx) => {
    await lockLoad(tx, loadId);
    const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId }, include: { load: true } });
    if (bid.status === "REJECTED") throw new AppError("DUPLICATE_ACTION", "Предложение уже отклонено.");
    if (bid.status !== "PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Отклонить можно только активное предложение.");
    const updated = await tx.bid.update({
      where: { id: bidId },
      data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: actor.userId },
    });
    await tx.bidMessage.create({
      data: {
        bidId,
        authorUserId: actor.userId,
        authorCompanyId: membership.companyId,
        side: "CUSTOMER",
        type: "REJECTED",
        message: reason,
      },
    });
    const stillActive = await tx.bid.count({ where: { loadId, status: "PENDING" } });
    if (stillActive === 0 && bid.load.status === "BIDDING") await tx.load.update({ where: { id: loadId }, data: { status: "PUBLISHED" } });
    await audit(
      actor,
      { action: AuditAction.BID_REJECTED, entityType: "Bid", entityId: bidId, companyId: membership.companyId, newValue: { reason } },
      tx,
    );
    await notify(tx, {
      userIds: await companyUserIds(tx, bid.carrierCompanyId, CARRIER_OFFICE_ROLES),
      type: "BID_REJECTED",
      title: `Предложение по грузу ${bid.load.publicNumber} отклонено`,
      body: reason ?? undefined,
      entityType: "Load",
      entityId: loadId,
      link: `/loads/${loadId}`,
    });
    return updated;
  });
}

/**
 * Принятие ставки — атомарно в одной транзакции:
 *  1) Bid → ACCEPTED; 2) остальные активные → REJECTED; 3) Load → CARRIER_SELECTED;
 *  4) TransportOrder; 5) Contract; 6) уведомления; 7) AuditLog.
 * Защита от гонок: блокировка строки груза (SELECT … FOR UPDATE) + уникальные индексы
 * (один ACCEPTED bid на груз, один заказ на груз).
 */
export async function acceptBid(actor: Actor, bidId: string, expected?: { amount: number; currency: string }) {
  const { loadId, membership } = await loadBidForCustomer(actor, bidId);
  requireCompanyPermission(actor, membership.companyId, "BID_ACCEPT", "Принимать предложения может только владелец груза.");
  // Актуализируем просроченные ставки вне транзакции, чтобы статус EXPIRED сохранился даже при отказе
  await expireStaleBids(prisma, loadId);

  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockLoad(tx, loadId);
        await expireStaleBids(tx, loadId);
        const load = await tx.load.findUniqueOrThrow({ where: { id: loadId }, include: { company: true } });
        const bid = await tx.bid.findUniqueOrThrow({ where: { id: bidId }, include: { carrier: true } });

        if (bid.status === "ACCEPTED") throw new AppError("BID_ALREADY_ACCEPTED", "Это предложение уже принято.");
        if (load.status === "CARRIER_SELECTED" || load.status === "CONVERTED_TO_ORDER") {
          throw new AppError("LOAD_ALREADY_CONVERTED", "Нельзя принять предложение: груз уже забронирован.");
        }
        if (load.status === "CANCELLED") throw new AppError("INVALID_STATE_TRANSITION", "Нельзя принять предложение по отменённому грузу.");
        if (!loadAcceptsBids(load.status)) throw new AppError("INVALID_STATE_TRANSITION", "Груз не опубликован.");
        if (bid.status === "EXPIRED") throw new AppError("INVALID_STATE_TRANSITION", "Срок действия предложения истёк.");
        if (bid.status !== "PENDING") throw new AppError("INVALID_STATE_TRANSITION", "Предложение уже неактивно.");
        if (bid.carrier.verificationStatus === "SUSPENDED") throw errors.forbidden("Деятельность перевозчика приостановлена.");
        await assertNotSelfDealing(tx, load.companyId, bid.carrierCompanyId);
        if ((await getSettings(tx)).requireVerifiedToBid && bid.carrier.verificationStatus !== "VERIFIED") {
          throw errors.forbidden("Перевозчик не прошёл проверку платформы — принять его предложение нельзя.");
        }
        // Заказчик принимает ту цену, которую видел: если перевозчик успел её изменить — сделка не создаётся
        if (expected && (toMinor(Number(bid.amount)) !== toMinor(expected.amount) || bid.currency !== expected.currency)) {
          throw new AppError(
            "CONFLICT",
            `Цена предложения изменилась: сейчас ${formatMoney(Number(bid.amount), bid.currency)}. Обновите страницу и проверьте условия.`,
          );
        }

        const now = new Date();
        await tx.bid.update({
          where: { id: bidId },
          data: { status: "ACCEPTED", decidedAt: now, decidedByUserId: actor.userId, counterAmount: null },
        });
        await tx.bidMessage.create({
          data: {
            bidId,
            authorUserId: actor.userId,
            authorCompanyId: membership.companyId,
            side: "CUSTOMER",
            type: "ACCEPTED",
            amount: bid.amount,
            currency: bid.currency,
          },
        });
        const others = await tx.bid.findMany({ where: { loadId, status: "PENDING", id: { not: bidId } } });
        if (others.length) {
          await tx.bid.updateMany({
            where: { id: { in: others.map((o) => o.id) } },
            data: { status: "REJECTED", decidedAt: now, decidedByUserId: actor.userId },
          });
        }
        await tx.load.update({ where: { id: loadId }, data: { status: "CARRIER_SELECTED" } });

        // Заказ
        const publicNumber = await nextPublicNumber(tx, "order");
        const isForwarder = load.company.type === "FORWARDER";
        const order = await tx.transportOrder.create({
          data: {
            publicNumber,
            loadId,
            shipperCompanyId: load.companyId,
            carrierCompanyId: bid.carrierCompanyId,
            forwarderCompanyId: isForwarder ? load.companyId : null,
            acceptedBidId: bidId,
            agreedAmount: bid.amount,
            currency: bid.currency,
            currentStatus: "CARRIER_SELECTED",
            loadingDate: load.loadingDateFrom,
            deliveryDate: load.deliveryDateFrom,
            participants: {
              create: [
                { companyId: load.companyId, role: isForwarder ? "FORWARDER" : "SHIPPER" },
                { companyId: bid.carrierCompanyId, role: "CARRIER" },
              ],
            },
            chatThread: { create: {} },
          },
        });
        await tx.transportOrderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: null,
            toStatus: "CARRIER_SELECTED",
            actorUserId: actor.userId,
            actorType: "USER",
            source: "WEB",
            // Сумма не пишется в историю статусов: историю видит и водитель
            comment: `Принято предложение ${bid.carrier.legalName}`,
          },
        });
        await audit(
          actor,
          {
            action: AuditAction.BID_ACCEPTED,
            entityType: "Bid",
            entityId: bidId,
            companyId: membership.companyId,
            oldValue: { status: "PENDING" },
            newValue: { status: "ACCEPTED", amount: bid.amount, currency: bid.currency, orderId: order.id },
          },
          tx,
        );
        await audit(
          actor,
          {
            action: AuditAction.ORDER_CREATED,
            entityType: "TransportOrder",
            entityId: order.id,
            companyId: membership.companyId,
            newValue: { publicNumber, loadId, carrier: bid.carrier.legalName, amount: bid.amount, currency: bid.currency },
          },
          tx,
        );
        // Для истории груза
        await audit(
          actor,
          {
            action: AuditAction.ORDER_CREATED,
            entityType: "Load",
            entityId: loadId,
            companyId: membership.companyId,
            newValue: { orderId: order.id, publicNumber },
          },
          tx,
        );

        // Договор
        const contract = await createContractInTx(tx, actor, order.id);
        await performTransitionInTx(tx, {
          orderId: order.id,
          to: "CONTRACT_PENDING",
          side: "SYSTEM",
          actor,
          source: "SYSTEM",
          comment: `Создан договор ${contract.documentNumber}`,
          silent: true,
        });

        // Уведомления
        await notify(tx, {
          userIds: await companyUserIds(tx, bid.carrierCompanyId, CARRIER_OFFICE_ROLES),
          type: "BID_ACCEPTED",
          title: `Ваше предложение по грузу ${load.publicNumber} принято`,
          body: `Создана перевозка ${publicNumber} на ${formatMoney(Number(bid.amount), bid.currency)}. Подпишите договор ${contract.documentNumber}.`,
          entityType: "TransportOrder",
          entityId: order.id,
          link: `/orders/${order.id}?tab=contract`,
        });
        await notify(tx, {
          userIds: await companyUserIds(tx, load.companyId, CUSTOMER_ROLES),
          type: "CONTRACT_READY",
          title: `Договор ${contract.documentNumber} готов к подписанию`,
          body: `Перевозка ${publicNumber} с ${bid.carrier.legalName}.`,
          entityType: "TransportOrder",
          entityId: order.id,
          link: `/orders/${order.id}?tab=contract`,
        });
        for (const o of others) {
          await notify(tx, {
            userIds: await companyUserIds(tx, o.carrierCompanyId, CARRIER_OFFICE_ROLES),
            type: "BID_REJECTED",
            title: `Груз ${load.publicNumber}: выбран другой перевозчик`,
            entityType: "Load",
            entityId: loadId,
            link: `/loads/${loadId}`,
          });
        }
        return { orderId: order.id, orderNumber: publicNumber, contractId: contract.id };
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("LOAD_ALREADY_CONVERTED", "Нельзя принять предложение: груз уже забронирован.");
    }
    throw e;
  }
}
