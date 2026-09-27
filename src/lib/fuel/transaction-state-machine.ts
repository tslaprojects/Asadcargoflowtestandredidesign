/**
 * State machine топливной транзакции.
 *
 * PENDING → AUTHORIZED (лимиты пройдены, сумма зарезервирована) | DECLINED
 * AUTHORIZED → APPROVED (провайдер подтвердил отпуск топлива) | COMPLETED | REVERSED (авторизация отменена) | DECLINED
 * APPROVED → COMPLETED (расчёт) | REVERSED
 * COMPLETED → REFUNDED (возврат) | DISPUTED (оспорена у провайдера)
 * DISPUTED → COMPLETED (спор отклонён) | REFUNDED
 * DECLINED, REVERSED, REFUNDED — финальные. Завершённая транзакция не редактируется: изменить её можно только
 * возвратом или спором.
 */
import type { FuelTransactionStatus } from "@/generated/prisma/enums";

export const FUEL_TX_TRANSITIONS: Record<FuelTransactionStatus, FuelTransactionStatus[]> = {
  PENDING: ["AUTHORIZED", "DECLINED"],
  AUTHORIZED: ["APPROVED", "COMPLETED", "REVERSED", "DECLINED"],
  APPROVED: ["COMPLETED", "REVERSED"],
  COMPLETED: ["REFUNDED", "DISPUTED"],
  DISPUTED: ["COMPLETED", "REFUNDED"],
  DECLINED: [],
  REVERSED: [],
  REFUNDED: [],
};

export const FUEL_TX_FINAL: FuelTransactionStatus[] = ["DECLINED", "REVERSED", "REFUNDED"];

/** Статусы, в которых заправка расходует лимиты карты. */
export const FUEL_TX_COUNTED: FuelTransactionStatus[] = ["AUTHORIZED", "APPROVED", "COMPLETED", "DISPUTED"];

/** Статусы с фактически отпущенным топливом (для аналитики и расхода). */
export const FUEL_TX_FUELED: FuelTransactionStatus[] = ["APPROVED", "COMPLETED", "DISPUTED"];

export function canFuelTxTransition(from: FuelTransactionStatus, to: FuelTransactionStatus): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: "Транзакция уже в этом статусе." };
  if (FUEL_TX_FINAL.includes(from)) return { ok: false, reason: "Транзакция завершена и не может быть изменена." };
  if (!FUEL_TX_TRANSITIONS[from].includes(to)) return { ok: false, reason: `Переход ${from} → ${to} недопустим.` };
  return { ok: true };
}
