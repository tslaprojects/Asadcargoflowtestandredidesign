import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation/auth";
import { bidCreateSchema, hasActiveBid, isBidExpired, loadAcceptsBids } from "@/lib/validation/bid";
import { loadInputSchema } from "@/lib/validation/load";
import { reviewSchema, signContractSchema } from "@/lib/validation/order";

const baseLoad = {
  title: "Электроника",
  cargoType: "ELECTRONICS",
  weightKg: 20000,
  priceType: "NEGOTIABLE",
  targetPrice: 4500,
  currency: "USD",
  stops: [
    { type: "PICKUP", country: "CN", city: "Урумчи", plannedDateFrom: "2030-01-01T03:00:00Z" },
    { type: "DELIVERY", country: "RU", city: "Москва", plannedDateFrom: "2030-01-10T03:00:00Z" },
  ],
};

describe("load validation", () => {
  it("принимает корректный груз", () => {
    expect(loadInputSchema.safeParse(baseLoad).success).toBe(true);
  });
  it("вес должен быть > 0", () => {
    const r = loadInputSchema.safeParse({ ...baseLoad, weightKg: 0 });
    expect(r.success).toBe(false);
  });
  it("объём > 0 и цена >= 0", () => {
    expect(loadInputSchema.safeParse({ ...baseLoad, volumeM3: -1 }).success).toBe(false);
    expect(loadInputSchema.safeParse({ ...baseLoad, targetPrice: -5 }).success).toBe(false);
  });
  it("дата загрузки не позже даты доставки", () => {
    const r = loadInputSchema.safeParse({
      ...baseLoad,
      stops: [
        { ...baseLoad.stops[0], plannedDateFrom: "2030-01-10T00:00:00Z" },
        { ...baseLoad.stops[1], plannedDateFrom: "2030-01-01T00:00:00Z" },
      ],
    });
    expect(r.success).toBe(false);
  });
  it("обязательны адреса загрузки и доставки", () => {
    expect(loadInputSchema.safeParse({ ...baseLoad, stops: [baseLoad.stops[0]] }).success).toBe(false);
    expect(loadInputSchema.safeParse({ ...baseLoad, stops: [baseLoad.stops[1], baseLoad.stops[0]] }).success).toBe(false);
    expect(loadInputSchema.safeParse({ ...baseLoad, stops: [{ ...baseLoad.stops[0], city: "" }, baseLoad.stops[1]] }).success).toBe(false);
  });
  it("фиксированная цена требует стоимость", () => {
    expect(loadInputSchema.safeParse({ ...baseLoad, priceType: "FIXED", targetPrice: null }).success).toBe(false);
  });
  it("приглашённые перевозчики для INVITE_ONLY", () => {
    expect(loadInputSchema.safeParse({ ...baseLoad, visibility: "INVITE_ONLY", invitedCarrierIds: [] }).success).toBe(false);
  });
  it("страна должна быть из справочника", () => {
    expect(loadInputSchema.safeParse({ ...baseLoad, stops: [{ ...baseLoad.stops[0], country: "XX" }, baseLoad.stops[1]] }).success).toBe(
      false,
    );
  });
});

describe("bid rules", () => {
  it("цена ставки > 0", () => {
    expect(bidCreateSchema.safeParse({ amount: 0, currency: "USD" }).success).toBe(false);
    expect(bidCreateSchema.safeParse({ amount: 4200, currency: "USD" }).success).toBe(true);
  });
  it("одна активная ставка", () => {
    expect(hasActiveBid([{ status: "REJECTED" }, { status: "WITHDRAWN" }])).toBe(false);
    expect(hasActiveBid([{ status: "PENDING" }])).toBe(true);
  });
  it("ставки принимаются только по опубликованному грузу", () => {
    expect(loadAcceptsBids("PUBLISHED")).toBe(true);
    expect(loadAcceptsBids("BIDDING")).toBe(true);
    for (const s of ["DRAFT", "CANCELLED", "CARRIER_SELECTED", "CONVERTED_TO_ORDER"]) expect(loadAcceptsBids(s)).toBe(false);
  });
  it("истечение срока ставки", () => {
    const now = new Date("2030-01-02T00:00:00Z");
    expect(isBidExpired({ status: "PENDING", validUntil: "2030-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isBidExpired({ status: "PENDING", validUntil: null }, now)).toBe(false);
    expect(isBidExpired({ status: "ACCEPTED", validUntil: "2030-01-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("other schemas", () => {
  it("регистрация: пароль с буквами и цифрами", () => {
    const base = {
      firstName: "A",
      lastName: "B",
      phone: "+7 700 000 00 00",
      email: "a@b.kz",
      activity: "SHIPPER",
      companyMode: "invite",
      inviteToken: "x".repeat(20),
    };
    expect(registerSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "onlyletters" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "Secure123" }).success).toBe(true);
  });
  it("подписание требует согласия и hash", () => {
    expect(signContractSchema.safeParse({ password: "x", agree: false, documentHash: "a".repeat(64) }).success).toBe(false);
    expect(signContractSchema.safeParse({ password: "x", agree: true, documentHash: "a".repeat(64) }).success).toBe(true);
  });
  it("рейтинг 1–5", () => {
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 5 }).success).toBe(true);
  });
});
