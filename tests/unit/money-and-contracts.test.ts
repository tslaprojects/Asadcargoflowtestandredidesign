import { describe, expect, it } from "vitest";
import { contentHash, renderTemplate } from "@/lib/contracts/template";
import { financeSummary, priceDeltaPercent, sumAmounts } from "@/lib/money";
import { utcToZonedParts, zonedToUtc } from "@/lib/tz";

describe("finance calculations", () => {
  it("спецификационный пример: 4200 / предоплата 1500 / остаток 2700", () => {
    const s = financeSummary(4200, "USD", [{ amount: 1500, status: "PAID", type: "PREPAYMENT", currency: "USD" }]);
    expect(s).toMatchObject({ total: 4200, prepaymentPlanned: 1500, paid: 1500, outstanding: 2700 });
  });
  it("отменённые и другие валюты не учитываются", () => {
    const s = financeSummary(1000, "USD", [
      { amount: 500, status: "CANCELLED", type: "PREPAYMENT", currency: "USD" },
      { amount: 300, status: "PAID", type: "OTHER", currency: "KZT" },
    ]);
    expect(s.paid).toBe(0);
    expect(s.outstanding).toBe(1000);
    expect(s.mismatchedCurrency).toBe(true);
  });
  it("нет ошибок float", () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
  });
  it("отклонение от целевой цены", () => {
    expect(priceDeltaPercent(4200, 4500)).toBe(-6.7);
    expect(priceDeltaPercent(4200, null)).toBeNull();
  });
});

describe("contract template & hash", () => {
  it("подставляет переменные", () => {
    expect(renderTemplate("Заказчик: {{shipper_company_name}}; {{missing}}", { shipper_company_name: "ABC" })).toBe("Заказчик: ABC; —");
  });
  it("hash меняется при изменении текста", () => {
    const a = contentHash("Договор v1");
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(contentHash("Договор v1")).toBe(a);
    expect(contentHash("Договор v2")).not.toBe(a);
  });
});

describe("timezones", () => {
  it("местное время точки → UTC и обратно", () => {
    const d = zonedToUtc("2026-10-01", "09:00", "Asia/Shanghai");
    expect(d.toISOString()).toBe("2026-10-01T01:00:00.000Z");
    expect(utcToZonedParts(d, "Europe/Moscow")).toEqual({ date: "2026-10-01", time: "04:00" });
  });
});
