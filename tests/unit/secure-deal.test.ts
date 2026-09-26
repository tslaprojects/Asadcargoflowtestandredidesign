import { describe, expect, it } from "vitest";
import { computeCommission, feeForRelease } from "@/lib/payments/commission";
import { releaseConditions } from "@/lib/payments/release-conditions";
import {
  canPaymentTransition,
  FINAL_PAYMENT_STATUSES,
  SECURE_DEAL_STATUSES,
  statusAfterMovement,
} from "@/lib/state-machine/payment-state-machine";
import { financeSummary } from "@/lib/money";

describe("Payment state machine", () => {
  it("RELEASED, REFUNDED и RESERVED устанавливает только платёжный провайдер", () => {
    for (const from of SECURE_DEAL_STATUSES) {
      for (const actor of ["PAYER", "PAYEE", "ADMIN", "SYSTEM"] as const) {
        expect(canPaymentTransition(from, "PAYMENT_RELEASED", actor).ok).toBe(false);
        expect(canPaymentTransition(from, "PAYMENT_REFUNDED", actor).ok).toBe(false);
      }
    }
    expect(canPaymentTransition("PAYMENT_RELEASE_PENDING", "PAYMENT_RELEASED", "PROVIDER").ok).toBe(true);
    expect(canPaymentTransition("PAYMENT_AUTHORIZED", "PAYMENT_RESERVED", "ADMIN").ok).toBe(false);
  });

  it("финальные статусы не меняются", () => {
    for (const from of FINAL_PAYMENT_STATUSES) {
      for (const to of SECURE_DEAL_STATUSES) {
        if (to === from) continue;
        expect(canPaymentTransition(from, to, "PROVIDER").ok).toBe(false);
        expect(canPaymentTransition(from, to, "ADMIN").ok).toBe(false);
      }
    }
  });

  it("заказчик и перевозчик не могут инициировать выплату; спор замораживает только система", () => {
    expect(canPaymentTransition("PAYMENT_RESERVED", "PAYMENT_RELEASE_PENDING", "PAYER").ok).toBe(false);
    expect(canPaymentTransition("PAYMENT_RESERVED", "PAYMENT_RELEASE_PENDING", "PAYEE").ok).toBe(false);
    expect(canPaymentTransition("PAYMENT_RESERVED", "PAYMENT_RELEASE_PENDING", "SYSTEM").ok).toBe(true);
    expect(canPaymentTransition("PAYMENT_RESERVED", "PAYMENT_DISPUTED", "SYSTEM").ok).toBe(true);
    expect(canPaymentTransition("PAYMENT_RESERVED", "PAYMENT_DISPUTED", "PAYER").ok).toBe(false);
    // Из спора выводит только администратор
    expect(canPaymentTransition("PAYMENT_DISPUTED", "PAYMENT_RESERVED", "ADMIN").ok).toBe(true);
    expect(canPaymentTransition("PAYMENT_DISPUTED", "PAYMENT_RESERVED", "PAYEE").ok).toBe(false);
    expect(canPaymentTransition("PAYMENT_DISPUTED", "PAYMENT_RELEASE_PENDING", "SYSTEM").ok).toBe(false);
  });

  it("заказчик может отменить только неподтверждённую оплату", () => {
    expect(canPaymentTransition("PAYMENT_PENDING", "PAYMENT_CANCELLED", "PAYER").ok).toBe(true);
    expect(canPaymentTransition("PAYMENT_RESERVED", "PAYMENT_CANCELLED", "PAYER").ok).toBe(false);
  });

  it("статус после движения средств: полная, частичная выплата, возврат, раздел суммы", () => {
    const A = 300_000; // $3 000 в центах
    expect(statusAfterMovement("PAYMENT_RELEASE_PENDING", { amountMinor: A, releasedMinor: A, refundedMinor: 0 })).toBe("PAYMENT_RELEASED");
    expect(statusAfterMovement("PAYMENT_DISPUTED", { amountMinor: A, releasedMinor: 250_000, refundedMinor: 0 })).toBe(
      "PAYMENT_PARTIALLY_RELEASED",
    );
    expect(statusAfterMovement("PAYMENT_RESERVED", { amountMinor: A, releasedMinor: 0, refundedMinor: A })).toBe("PAYMENT_REFUNDED");
    expect(statusAfterMovement("PAYMENT_PARTIALLY_RELEASED", { amountMinor: A, releasedMinor: 250_000, refundedMinor: 50_000 })).toBe(
      "PAYMENT_RELEASED",
    );
    expect(statusAfterMovement("PAYMENT_DISPUTED", { amountMinor: A, releasedMinor: 0, refundedMinor: 50_000 })).toBe("PAYMENT_DISPUTED");
  });
});

describe("Комиссия платформы", () => {
  it("процент + фикс, не превышает сумму", () => {
    expect(computeCommission(3000, { percent: 2, fixed: 0 })).toEqual({ fee: 60, payout: 2940 });
    expect(computeCommission(3000, { percent: 1.5, fixed: 10 })).toEqual({ fee: 55, payout: 2945 });
    expect(computeCommission(3000, { percent: 0, fixed: 0 })).toEqual({ fee: 0, payout: 3000 });
    expect(computeCommission(5, { percent: 0, fixed: 10 })).toEqual({ fee: 5, payout: 0 });
    expect(computeCommission(0.1, { percent: 2.5, fixed: 0 }).fee).toBe(0);
  });

  it("комиссия распределяется пропорционально выплатам и в сумме равна platformFee", () => {
    const p = { amount: 3000, platformFee: 60, releasedAmount: 0, feeCollected: 0 };
    const f1 = feeForRelease(p, 2500);
    expect(f1).toBe(50);
    const f2 = feeForRelease({ ...p, releasedAmount: 2500, feeCollected: f1 }, 500);
    expect(f2).toBe(10);
    expect(f1 + f2).toBe(60);
    // С возвращённой части комиссия не удерживается
    expect(feeForRelease({ amount: 1000, platformFee: 20, releasedAmount: 0, feeCollected: 0 }, 333.33)).toBe(6.67);
  });
});

describe("Условия выплаты", () => {
  const base = {
    paymentStatus: "PAYMENT_RESERVED" as const,
    orderStatus: "DELIVERED" as const,
    deliveredAt: new Date(),
    podCount: 1,
    requirePod: true,
    receiptConfirmedAt: new Date(),
    receiptAutoConfirmed: false,
    confirmationDueAt: null,
    hasOpenDispute: false,
  };
  it("все условия выполнены → готово к выплате", () => {
    expect(releaseConditions(base).ready).toBe(true);
  });
  it("нет документов, нет подтверждения, спор, нет резерва → не готово", () => {
    expect(releaseConditions({ ...base, podCount: 0 }).ready).toBe(false);
    expect(releaseConditions({ ...base, podCount: 0, requirePod: false }).ready).toBe(true);
    expect(releaseConditions({ ...base, receiptConfirmedAt: null }).ready).toBe(false);
    expect(releaseConditions({ ...base, hasOpenDispute: true }).ready).toBe(false);
    expect(releaseConditions({ ...base, paymentStatus: "PAYMENT_PENDING" }).ready).toBe(false);
  });
});

describe("Финансовая сводка с безопасной сделкой", () => {
  it("оплачено = выплачено перевозчику, обеспечено = удерживаемый остаток", () => {
    const s = financeSummary(3000, "USD", [
      { amount: 3000, status: "PAYMENT_PARTIALLY_RELEASED", type: "SECURE_DEAL", currency: "USD", releasedAmount: 2500, refundedAmount: 0 },
    ]);
    expect(s.paid).toBe(2500);
    expect(s.secured).toBe(500);
    expect(s.outstanding).toBe(500);
  });
  it("отменённая сделка не учитывается; возврат уменьшает остаток к оплате", () => {
    expect(financeSummary(3000, "USD", [{ amount: 3000, status: "PAYMENT_CANCELLED", type: "SECURE_DEAL", currency: "USD" }]).secured).toBe(
      0,
    );
    const refunded = financeSummary(3000, "USD", [
      { amount: 3000, status: "PAYMENT_RELEASED", type: "SECURE_DEAL", currency: "USD", releasedAmount: 2500, refundedAmount: 500 },
    ]);
    expect(refunded.outstanding).toBe(0);
    expect(refunded.refunded).toBe(500);
  });
});
