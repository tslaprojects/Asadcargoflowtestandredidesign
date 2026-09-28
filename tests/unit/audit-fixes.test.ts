import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIpFrom } from "@/lib/auth/session";
import { redactSecrets } from "@/lib/notifications/adapters";
import { getPaymentProvider } from "@/lib/payments/provider";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe("SEC-002: IP клиента за доверенным прокси", () => {
  it("берёт адрес, дописанный прокси, а не подставленный клиентом", () => {
    expect(clientIpFrom("6.6.6.6, 203.0.113.7", null, "1")).toBe("203.0.113.7");
    expect(clientIpFrom("6.6.6.6, 203.0.113.7, 10.0.0.2", null, "2")).toBe("203.0.113.7");
    expect(clientIpFrom(null, "198.51.100.1", "1")).toBe("198.51.100.1");
    expect(clientIpFrom("6.6.6.6", "198.51.100.1", "0")).toBe("198.51.100.1");
  });
});

describe("SEC-001: секреты не попадают в лог в production", () => {
  it("маскирует токены сброса пароля и приглашений", () => {
    vi.stubEnv("NODE_ENV", "production");
    const t = redactSecrets("https://x/reset-password?token=abcDEF123 и https://x/invite/Zz-9_ab");
    expect(t).not.toContain("abcDEF123");
    expect(t).not.toContain("Zz-9_ab");
  });
});

describe("PAY-001: тестовый платёжный провайдер в production", () => {
  it("запрещён без явного разрешения", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
    vi.stubEnv("DEMO_SEED", "");
    vi.stubEnv("ALLOW_SANDBOX_PAYMENTS", "");
    expect(() => getPaymentProvider()).toThrow(/запрещён/);
    vi.stubEnv("ALLOW_SANDBOX_PAYMENTS", "1");
    expect(getPaymentProvider().code).toBe("sandbox");
  });
  it("неизвестный провайдер — ошибка конфигурации, а не молчаливая подмена", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "unknown-psp");
    expect(() => getPaymentProvider()).toThrow(/Неизвестный/);
  });
});

describe("SEC-005: безопасный переход после входа", async () => {
  const { safeRedirectPath } = await import("@/lib/safe-redirect");
  it("пропускает только пути своего сайта", () => {
    const o = "https://app.example";
    expect(safeRedirectPath("/orders/1?tab=chat", o)).toBe("/orders/1?tab=chat");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/\t/evil.com", "", null]) {
      expect(safeRedirectPath(bad, o)).toBeNull();
    }
  });
});

describe("CFG-002: cookie сессии в production", async () => {
  const { secureCookies } = await import("@/lib/auth/session");
  it("Secure по умолчанию, кроме явного локального http", () => {
    expect(secureCookies({ NODE_ENV: "production" })).toBe(true);
    expect(secureCookies({ NODE_ENV: "production", APP_URL: "https://cargo.example" })).toBe(true);
    expect(secureCookies({ NODE_ENV: "production", APP_URL: "http://localhost:3000" })).toBe(false);
    expect(secureCookies({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("BIZ-012: риск заправки не ниже самого серьёзного несоответствия", async () => {
  const { transactionRisk } = await import("@/lib/fuel/anomaly-rules");
  it("критическое несоответствие делает заправку критической при низкой сумме баллов", () => {
    expect(transactionRisk(30, [{ severity: "CRITICAL" }])).toBe("CRITICAL");
    expect(transactionRisk(90, [{ severity: "HIGH" }])).toBe("CRITICAL");
    expect(transactionRisk(10, [])).toBe("LOW");
  });
});

describe("ERR-001: фильтры списков валидируются, а не падают в БД", async () => {
  const { orderListQuerySchema } = await import("@/lib/validation/order");
  const { loadListQuerySchema } = await import("@/lib/validation/load");
  it("отклоняет неизвестный статус, мусорную дату и не-UUID", () => {
    expect(orderListQuerySchema.safeParse({ status: "FOO" }).success).toBe(false);
    expect(orderListQuerySchema.safeParse({ dateFrom: "garbage" }).success).toBe(false);
    expect(orderListQuerySchema.safeParse({ carrierId: "abc" }).success).toBe(false);
    expect(loadListQuerySchema.safeParse({ status: "FOO" }).success).toBe(false);
    expect(orderListQuerySchema.parse({ status: "IN_TRANSIT,DELIVERED", dateFrom: "2026-09-01" }).status).toEqual([
      "IN_TRANSIT",
      "DELIVERED",
    ]);
  });
});
