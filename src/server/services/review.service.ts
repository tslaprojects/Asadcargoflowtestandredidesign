import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import type { reviewSchema } from "@/lib/validation/order";
import { requireOrderAccess } from "./access";
import { CARRIER_OFFICE_ROLES, companyUserIds, CUSTOMER_ROLES, notify } from "./notification.service";

export async function createReview(actor: Actor, orderId: string, input: z.output<typeof reviewSchema>) {
  const { access, order } = await requireOrderAccess(actor, orderId, "REVIEW_CREATE");
  if (access.side !== "CUSTOMER" && access.side !== "CARRIER") throw errors.forbidden("Оставить отзыв могут стороны сделки.");
  if (order.currentStatus !== "CLOSED") throw new AppError("INVALID_STATE_TRANSITION", "Отзыв можно оставить после закрытия перевозки.");
  const fromCompanyId = access.membership!.companyId;
  const toCompanyId = access.side === "CUSTOMER" ? order.carrierCompanyId : order.shipperCompanyId;
  try {
    return await prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: { orderId, fromCompanyId, toCompanyId, fromUserId: actor.userId, ...input },
      });
      await audit(
        actor,
        {
          action: AuditAction.REVIEW_CREATED,
          entityType: "TransportOrder",
          entityId: orderId,
          companyId: fromCompanyId,
          newValue: { rating: input.rating, toCompanyId },
        },
        tx,
      );
      await notify(tx, {
        userIds: await companyUserIds(tx, toCompanyId, access.side === "CUSTOMER" ? CARRIER_OFFICE_ROLES : CUSTOMER_ROLES),
        type: "REVIEW_RECEIVED",
        title: `Новый отзыв по перевозке ${order.publicNumber}`,
        body: `Оценка: ${input.rating} из 5`,
        entityType: "TransportOrder",
        entityId: orderId,
        link: `/orders/${orderId}`,
      });
      return review;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE_ACTION", "Ваша компания уже оставила отзыв по этой перевозке.");
    }
    throw e;
  }
}
