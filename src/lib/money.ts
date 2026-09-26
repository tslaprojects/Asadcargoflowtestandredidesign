import type { Currency } from "@/generated/prisma/enums";

export const CURRENCIES: Currency[] = ["USD", "CNY", "KZT", "RUB"];

export const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: "$", CNY: "¥", KZT: "₸", RUB: "₽" };

/** Денежная арифметика в минорных единицах, чтобы избежать ошибок float. */
export const toMinor = (amount: number) => Math.round(amount * 100);
export const fromMinor = (minor: number) => minor / 100;

export function sumAmounts(amounts: number[]): number {
  return fromMinor(amounts.reduce((acc, a) => acc + toMinor(a), 0));
}

export type PaymentLike = {
  amount: number;
  status: string;
  type: string;
  currency: string;
  /** Для безопасной сделки: выплачено перевозчику / возвращено заказчику */
  releasedAmount?: number | null;
  refundedAmount?: number | null;
};

export type FinanceSummary = {
  total: number;
  prepaymentPlanned: number;
  paid: number;
  invoiced: number;
  /** Безопасная сделка: сумма, обеспеченная у провайдера и ещё не выплаченная/не возвращённая */
  secured: number;
  /** Безопасная сделка: возвращено заказчику */
  refunded: number;
  outstanding: number;
  currency: Currency;
  mismatchedCurrency: boolean;
};

const SECURE_HELD = ["PAYMENT_RESERVED", "PAYMENT_RELEASE_PENDING", "PAYMENT_DISPUTED", "PAYMENT_PARTIALLY_RELEASED"];
const SECURE_DEAD = ["PAYMENT_CANCELLED", "PAYMENT_FAILED"];

/**
 * Финансовая сводка по заказу. Учитываются только платежи в валюте заказа;
 * отменённые платежи не учитываются. Для безопасной сделки «оплачено» — это сумма, выплаченная перевозчику.
 */
export function financeSummary(total: number, currency: Currency, payments: PaymentLike[]): FinanceSummary {
  const active = payments.filter((p) => p.status !== "CANCELLED" && !SECURE_DEAD.includes(p.status));
  const same = active.filter((p) => p.currency === currency);
  const ledger = same.filter((p) => p.type !== "SECURE_DEAL");
  const secure = same.filter((p) => p.type === "SECURE_DEAL");
  const released = sumAmounts(secure.map((p) => Number(p.releasedAmount ?? 0)));
  const refunded = sumAmounts(secure.map((p) => Number(p.refundedAmount ?? 0)));
  const secured = sumAmounts(
    secure
      .filter((p) => SECURE_HELD.includes(p.status))
      .map((p) => fromMinor(toMinor(p.amount) - toMinor(Number(p.releasedAmount ?? 0)) - toMinor(Number(p.refundedAmount ?? 0)))),
  );
  const paid = sumAmounts([...ledger.filter((p) => p.status === "PAID").map((p) => p.amount), released]);
  const invoiced = sumAmounts(ledger.filter((p) => p.status === "INVOICED").map((p) => p.amount));
  const prepaymentPlanned = sumAmounts(ledger.filter((p) => p.type === "PREPAYMENT").map((p) => p.amount));
  return {
    total,
    prepaymentPlanned,
    paid,
    invoiced,
    secured,
    refunded,
    outstanding: fromMinor(Math.max(0, toMinor(total) - toMinor(paid) - toMinor(refunded))),
    currency,
    mismatchedCurrency: active.some((p) => p.currency !== currency),
  };
}

export function formatMoney(amount: number | null | undefined, currency: Currency | string, locale = "ru-RU"): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

/** Разница цен в процентах относительно базовой (для сравнения ставок с целевой ценой). */
export function priceDeltaPercent(amount: number, base: number | null | undefined): number | null {
  if (!base || base <= 0) return null;
  return Math.round(((amount - base) / base) * 1000) / 10;
}
