/**
 * Операционное состояние перевозки — то, что диспетчер видит на карте и в списках.
 * Не меняет бизнес-статус (state machine): это производная «здоровья» объекта для интерфейса.
 */
import type { OrderStatus } from "@/generated/prisma/enums";
import { IN_TRANSIT_STATUSES, STATUS_ORDER, TRIP_STATUSES } from "@/lib/state-machine/order-state-machine";

export type Health = "moving" | "arriving" | "delayed" | "waiting" | "attention" | "done" | "cancelled";

const DAY = 86_400_000;

export const HEALTH_META: Record<Health, { label: string; tone: "info" | "delayed" | "warning" | "danger" | "success" | "neutral" }> = {
  moving: { label: "В движении", tone: "info" },
  arriving: { label: "Прибывает", tone: "info" },
  delayed: { label: "Опаздывает", tone: "delayed" },
  waiting: { label: "Ожидание", tone: "warning" },
  attention: { label: "Требует внимания", tone: "danger" },
  done: { label: "Доставлено", tone: "success" },
  cancelled: { label: "Отменено", tone: "neutral" },
};

/**
 * moving   — машина в рейсе по графику; arriving — на разгрузке или доставка в ближайшие 24 ч;
 * delayed  — в рейсе, а плановая дата доставки прошла (или загрузка просрочена > 24 ч);
 * waiting  — документы, назначение машины/водителя, ожидание загрузки; attention — спор или приостановка.
 */
export function orderHealth(
  status: OrderStatus,
  dates: { loadingDate?: Date | string | null; deliveryDate?: Date | string | null },
  now: Date = new Date(),
): Health {
  if (status === "CANCELLED") return "cancelled";
  if (status === "DELIVERED" || status === "CLOSED") return "done";
  if (status === "DISPUTED" || status === "ON_HOLD") return "attention";
  const t = now.getTime();
  const delivery = dates.deliveryDate ? new Date(dates.deliveryDate).getTime() : null;
  const loading = dates.loadingDate ? new Date(dates.loadingDate).getTime() : null;
  if (IN_TRANSIT_STATUSES.includes(status)) {
    if (status === "AT_DELIVERY") return "arriving";
    if (delivery !== null && delivery < t) return "delayed";
    if (delivery !== null && delivery - t < DAY) return "arriving";
    return "moving";
  }
  if (TRIP_STATUSES.includes(status) && loading !== null && t - loading > DAY) return "delayed";
  return "waiting";
}

/** Доля пройденного пути по основному маршруту статусов (0…1). */
export function orderProgress(status: OrderStatus): number {
  if (status === "CLOSED" || status === "DELIVERED") return 1;
  const i = STATUS_ORDER.indexOf(status);
  if (i < 0) return 0;
  return Math.max(0, Math.min(1, i / (STATUS_ORDER.indexOf("DELIVERED") || 1)));
}

/** Прогресс рейса по карте: от загрузки (LOADED) до прибытия на разгрузку. */
export function tripProgress(status: OrderStatus): number {
  const from = STATUS_ORDER.indexOf("LOADED");
  const to = STATUS_ORDER.indexOf("AT_DELIVERY");
  const i = STATUS_ORDER.indexOf(status);
  if (status === "DELIVERED" || status === "CLOSED") return 1;
  if (i <= from) return 0;
  return Math.min(1, (i - from) / (to - from));
}
