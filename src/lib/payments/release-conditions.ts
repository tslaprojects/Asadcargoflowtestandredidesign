/**
 * Условия выплаты по безопасной сделке — прозрачный чек-лист, одинаковый для сервера и интерфейса.
 */
import type { OrderStatus } from "@/generated/prisma/enums";
import { HELD_STATUSES, type SecureDealStatus } from "@/lib/state-machine/payment-state-machine";

export type ReleaseConditionInput = {
  paymentStatus: SecureDealStatus;
  orderStatus: OrderStatus;
  deliveredAt: Date | string | null;
  podCount: number;
  requirePod: boolean;
  receiptConfirmedAt: Date | string | null;
  receiptAutoConfirmed: boolean;
  confirmationDueAt: Date | string | null;
  hasOpenDispute: boolean;
};

export type ReleaseCondition = { key: string; label: string; met: boolean; hint?: string };

export function releaseConditions(i: ReleaseConditionInput): { conditions: ReleaseCondition[]; ready: boolean } {
  const reserved = HELD_STATUSES.includes(i.paymentStatus) || i.paymentStatus === "PAYMENT_RELEASED";
  const conditions: ReleaseCondition[] = [
    { key: "reserved", label: "Оплата обеспечена у платёжного провайдера", met: reserved },
    {
      key: "delivered",
      label: "Перевозчик отметил доставку груза",
      met: Boolean(i.deliveredAt) || i.orderStatus === "DELIVERED" || i.orderStatus === "CLOSED",
    },
  ];
  if (i.requirePod) {
    conditions.push({
      key: "documents",
      label: "Загружены подтверждающие документы (POD или подписанная CMR)",
      met: i.podCount > 0,
      hint: i.podCount > 0 ? undefined : "Без документов выплата не выполняется, в том числе автоматически.",
    });
  }
  conditions.push({
    key: "confirmation",
    label: i.receiptAutoConfirmed
      ? "Срок проверки истёк без спора — получение подтверждено автоматически"
      : "Заказчик подтвердил получение груза (или истёк срок проверки без спора)",
    met: Boolean(i.receiptConfirmedAt),
    hint: !i.receiptConfirmedAt && i.confirmationDueAt ? "confirmationDue" : undefined,
  });
  conditions.push({ key: "noDispute", label: "Нет открытого спора", met: !i.hasOpenDispute });
  return { conditions, ready: conditions.every((c) => c.met) };
}
