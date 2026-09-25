import type { Currency } from "@/generated/prisma/enums";

export const CURRENCIES: Currency[] = ["USD", "CNY", "KZT", "RUB"];

export const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: "$", CNY: "¥", KZT: "₸", RUB: "₽" };

/** Денежная арифметика в минорных единицах, чтобы избежать ошибок float. */
export const toMinor = (amount: number) => Math.round(amount * 100);
export const fromMinor = (minor: number) => minor / 100;

export function sumAmounts(amounts: number[]): number {
  return fromMinor(amounts.reduce((acc, a) => acc + toMinor(a), 0));
}

export type PaymentLike = { amount: number; status: string; type: string; currency: string };

export type FinanceSummary = {
  total: number;
  prepaymentPlanned: number;
  paid: number;
  invoiced: number;
  outstanding: number;
  currency: Currency;
  mismatchedCurrency: boolean;
};

/**
 * Финансовая сводка по заказу. Учитываются только платежи в валюте заказа;
 * отменённые платежи не учитываются.
 */
export function financeSummary(total: number, currency: Currency, payments: PaymentLike[]): FinanceSummary {
  const active = payments.filter((p) => p.status !== "CANCELLED");
  const same = active.filter((p) => p.currency === currency);
  const paid = sumAmounts(same.filter((p) => p.status === "PAID").map((p) => p.amount));
  const invoiced = sumAmounts(same.filter((p) => p.status === "INVOICED").map((p) => p.amount));
  const prepaymentPlanned = sumAmounts(same.filter((p) => p.type === "PREPAYMENT").map((p) => p.amount));
  return {
    total,
    prepaymentPlanned,
    paid,
    invoiced,
    outstanding: fromMinor(Math.max(0, toMinor(total) - toMinor(paid))),
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
