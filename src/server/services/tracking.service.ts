import "server-only";
import type { z } from "zod";
import { audit, AuditAction } from "@/lib/audit/audit";
import type { Actor } from "@/lib/auth/actor";
import { prisma } from "@/lib/db/prisma";
import { AppError, errors } from "@/lib/errors";
import { TRIP_STATUSES } from "@/lib/state-machine/order-state-machine";
import type { trackingSchema } from "@/lib/validation/order";
import { requireOrderAccess } from "./access";

type TrackingInput = z.output<typeof trackingSchema>;

/** Водитель (или диспетчер) передаёт текущее местоположение. */
export async function addLocation(actor: Actor, orderId: string, input: TrackingInput) {
  const { access, order } = await requireOrderAccess(actor, orderId, "TRACKING_UPDATE");
  if (access.side !== "DRIVER" && access.side !== "CARRIER" && access.side !== "ADMIN") {
    throw errors.forbidden("Передавать местоположение может водитель или перевозчик.");
  }
  if (!TRIP_STATUSES.includes(order.currentStatus)) {
    throw new AppError("INVALID_STATE_TRANSITION", "Местоположение передаётся только во время рейса.");
  }
  const recordedAt = input.recordedAt && input.recordedAt <= new Date() ? input.recordedAt : new Date();
  return prisma.$transaction(async (tx) => {
    const ev = await tx.trackingEvent.create({
      data: {
        orderId,
        userId: actor.userId,
        type: "MANUAL_LOCATION",
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
        note: input.note,
        source: access.side === "DRIVER" ? "DRIVER_APP" : "WEB",
        recordedAt,
      },
    });
    await audit(
      actor,
      {
        action: AuditAction.TRACKING_UPDATED,
        entityType: "TransportOrder",
        entityId: orderId,
        newValue: { latitude: input.latitude, longitude: input.longitude, accuracy: input.accuracy },
      },
      tx,
    );
    return ev;
  });
}

export async function listTracking(actor: Actor, orderId: string, opts: { limit: number }) {
  await requireOrderAccess(actor, orderId, "TRACKING_VIEW");
  const [items, last] = await Promise.all([
    prisma.trackingEvent.findMany({ where: { orderId }, orderBy: { createdAt: "desc" }, take: opts.limit }),
    prisma.trackingEvent.findFirst({
      where: { orderId, latitude: { not: null }, longitude: { not: null } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { items, lastLocation: last };
}
