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
