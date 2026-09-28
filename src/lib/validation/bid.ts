import { z } from "zod";
import { currencySchema, optionalDate, optionalText } from "./common";

export const bidCreateSchema = z.object({
  amount: z.coerce.number({ message: "Укажите цену" }).positive("Цена должна быть больше 0").max(100_000_000, "Слишком большая сумма"),
  currency: currencySchema,
  comment: optionalText(1000),
  readyDate: optionalDate,
  terms: optionalText(1000),
  validUntil: optionalDate,
});

export const bidCounterSchema = z.object({
  amount: z.coerce.number({ message: "Укажите цену" }).positive("Цена должна быть больше 0").max(100_000_000),
  message: optionalText(1000),
});

export const bidRejectSchema = z.object({ reason: optionalText(500) });

/** Ответ перевозчика на встречное предложение: принять цену заказчика или предложить новую. */
export const bidRespondSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("agree"), message: optionalText(1000) }),
  z.object({
    action: z.literal("propose"),
    amount: z.coerce.number({ message: "Укажите цену" }).positive("Цена должна быть больше 0").max(100_000_000, "Слишком большая сумма"),
    message: optionalText(1000),
  }),
]);

/** Принятие предложения: заказчик подтверждает сумму и валюту, которые видел на экране. */
export const bidAcceptSchema = z.object({
  expectedAmount: z.coerce.number({ message: "Не передана сумма предложения" }).positive(),
  expectedCurrency: currencySchema,
});

export type BidRule = { status: string };

/** Бизнес-правило: у перевозчика может быть только одна активная ставка на груз. */
export function hasActiveBid(bids: BidRule[]): boolean {
  return bids.some((b) => b.status === "PENDING");
}

/** Можно ли делать ставку на груз в данном статусе. */
export function loadAcceptsBids(loadStatus: string): boolean {
  return loadStatus === "PUBLISHED" || loadStatus === "BIDDING";
}

export function isBidExpired(bid: { status: string; validUntil: Date | string | null }, now = new Date()): boolean {
  return bid.status === "PENDING" && !!bid.validUntil && new Date(bid.validUntil) < now;
}

/** Груз «актуален» для биржи: крайняя дата загрузки не прошла (сутки запаса на разницу часовых поясов). */
export const STALE_LOAD_GRACE_MS = 24 * 60 * 60_000;
export function isLoadStale(load: { loadingDateFrom: Date | string; loadingDateTo: Date | string | null }, now = new Date()): boolean {
  const latest = new Date(load.loadingDateTo ?? load.loadingDateFrom);
  return latest.getTime() < now.getTime() - STALE_LOAD_GRACE_MS;
}

/** Prisma-условие «груз актуален» (та же логика, что isLoadStale). */
export function actualLoadWhere(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_LOAD_GRACE_MS);
  return {
    OR: [{ loadingDateTo: { gte: cutoff } }, { loadingDateTo: null, loadingDateFrom: { gte: cutoff } }],
    company: { verificationStatus: { not: "SUSPENDED" as const }, deletedAt: null },
  };
}
