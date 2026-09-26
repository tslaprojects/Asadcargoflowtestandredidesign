/**
 * Комиссия платформы по безопасной сделке.
 * Правило задаётся в настройках платформы (процент + фиксированная часть в валюте сделки)
 * и фиксируется снимком в PaymentRecord при создании сделки — изменение настроек не влияет на уже оформленные сделки.
 * Все расчёты — в минорных единицах (центы/тиыны), без float-ошибок.
 */
import type { Currency } from "@/generated/prisma/enums";
import { fromMinor, toMinor } from "@/lib/money";

export type CommissionRule = {
  /** Процент от суммы сделки, 0–50 */
  percent: number;
  /** Фиксированная часть в валюте сделки */
  fixed: number;
};

export type CommissionSettings = {
  commissionPercent: number;
  commissionFixed: Partial<Record<Currency, number>>;
};

export function commissionRuleFor(settings: CommissionSettings, currency: Currency): CommissionRule {
  return { percent: settings.commissionPercent ?? 0, fixed: settings.commissionFixed?.[currency] ?? 0 };
}

/** Комиссия с суммы сделки. Не может превышать сумму сделки. */
export function computeCommission(amount: number, rule: CommissionRule): { fee: number; payout: number } {
  const amountMinor = toMinor(amount);
  const raw = Math.round((amountMinor * rule.percent) / 100) + toMinor(rule.fixed);
  const feeMinor = Math.min(amountMinor, Math.max(0, raw));
  return { fee: fromMinor(feeMinor), payout: fromMinor(amountMinor - feeMinor) };
}

/**
 * Комиссия, удерживаемая из очередной выплаты перевозчику.
 * Распределяется пропорционально выплаченной доле: после выплаты всей суммы удержана ровно platformFee.
 * С возвращённой заказчику части комиссия не удерживается.
 */
export function feeForRelease(p: { amount: number; platformFee: number; releasedAmount: number; feeCollected: number }, release: number) {
  const amountMinor = toMinor(p.amount);
  if (amountMinor <= 0) return 0;
  const releasedAfter = toMinor(p.releasedAmount) + toMinor(release);
  const due = Math.round((toMinor(p.platformFee) * releasedAfter) / amountMinor);
  return fromMinor(Math.max(0, Math.min(due - toMinor(p.feeCollected), toMinor(release))));
}
