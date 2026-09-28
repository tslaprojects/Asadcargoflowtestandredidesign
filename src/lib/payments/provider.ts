import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Currency, PaymentTransactionKind } from "@/generated/prisma/enums";

/**
 * Адаптер платёжного провайдера.
 *
 * CargoFlow НЕ является кошельком и не хранит деньги: резервирование, выплата перевозчику и возврат
 * выполняются лицензированным провайдером (банк / PSP с эскроу или удержанием средств).
 * CargoFlow отправляет команды с ключом идемпотентности и принимает результат — синхронно или через webhook.
 *
 * Реализации:
 *  - sandbox — тестовый режим: операции «успешны» сразу, реальные деньги не движутся (разработка, демо, тесты);
 *  - manual  — провайдер не подключён: каждая операция ждёт ручного подтверждения администратором
 *              по данным банка-партнёра (выписка, платёжное поручение).
 * Реальный провайдер подключается реализацией этого интерфейса + обработкой его webhook.
 */
export type ProviderRequest = {
  kind: PaymentTransactionKind;
  /** Уникальный ключ операции — повторная отправка не должна приводить к повторному движению средств */
  idempotencyKey: string;
  paymentId: string;
  orderNumber: string;
  amount: number;
  /** Комиссия платформы, удерживаемая из выплаты (для RELEASE) */
  fee: number;
  currency: Currency;
  payerCompanyId: string;
  payeeCompanyId: string;
  /** Идентификатор резерва у провайдера (для RELEASE / REFUND / VOID) */
  reference: string | null;
};

export type ProviderResult =
  | { status: "SUCCEEDED"; providerTransactionId: string }
  | { status: "PENDING"; providerTransactionId: string | null }
  | { status: "FAILED"; providerTransactionId: string | null; failureReason: string };

export interface PaymentProvider {
  readonly code: string;
  readonly title: string;
  /** true — тестовый режим, реальные деньги не движутся */
  readonly testMode: boolean;
  /** true — результат операций подтверждает администратор вручную */
  readonly manualConfirmation: boolean;
  /** true — авторизация и резервирование — отдельные операции (AUTHORIZE → RESERVE), иначе сразу RESERVE */
  readonly twoStepReserve: boolean;
  execute(req: ProviderRequest): Promise<ProviderResult>;
}

export const sandboxProvider: PaymentProvider = {
  code: "sandbox",
  title: "Тестовый платёжный провайдер (sandbox)",
  testMode: true,
  manualConfirmation: false,
  twoStepReserve: true,
  async execute(req) {
    // Детерминированный id: повтор с тем же ключом возвращает тот же результат (идемпотентность)
    const id = `sbx_${createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 24)}`;
    return { status: "SUCCEEDED", providerTransactionId: id };
  },
};

export const manualProvider: PaymentProvider = {
  code: "manual",
  title: "Банк-партнёр (ручное подтверждение операций)",
  testMode: false,
  manualConfirmation: true,
  twoStepReserve: false,
  async execute() {
    return { status: "PENDING", providerTransactionId: null };
  },
};

const PROVIDERS: Record<string, PaymentProvider> = { sandbox: sandboxProvider, manual: manualProvider };

let override: PaymentProvider | null = null;

/** Для тестов: подмена провайдера (например, имитация отказа). */
export function setPaymentProviderOverride(p: PaymentProvider | null) {
  override = p;
}

/**
 * Активный провайдер: PAYMENT_PROVIDER=sandbox|manual.
 * По умолчанию в production — manual (никаких «успешных» операций без подтверждения), иначе — sandbox.
 */
export function getPaymentProvider(): PaymentProvider {
  if (override) return override;
  const production = process.env.NODE_ENV === "production";
  const code = process.env.PAYMENT_PROVIDER || (production ? "manual" : "sandbox");
  const provider = PROVIDERS[code];
  if (!provider)
    throw new Error(`Неизвестный платёжный провайдер PAYMENT_PROVIDER="${code}". Допустимо: ${Object.keys(PROVIDERS).join(", ")}.`);
  // Тестовый провайдер «успешно» резервирует и выплачивает без движения денег — в production только явно (демо-стенд)
  if (provider.testMode && production && process.env.ALLOW_SANDBOX_PAYMENTS !== "1" && process.env.DEMO_SEED !== "1") {
    throw new Error(
      "PAYMENT_PROVIDER=sandbox запрещён в production: задайте manual или реальный провайдер (для демо-стенда — ALLOW_SANDBOX_PAYMENTS=1).",
    );
  }
  return provider;
}

export function providerByCode(code: string): PaymentProvider | null {
  if (override && override.code === code) return override;
  return PROVIDERS[code] ?? null;
}

/** Проверка подписи webhook: HMAC-SHA256(body, PAYMENT_WEBHOOK_SECRET) в заголовке X-CargoFlow-Signature. */
export function verifyWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

/**
 * Секрет webhook: отдельный для провайдера (`<BASE>_<PROVIDER>`, например PAYMENT_WEBHOOK_SECRET_KASPI),
 * иначе общий (`<BASE>`). Имя провайдера в URL не аутентифицировано, поэтому отдельные секреты не дают одному
 * интегратору выдавать себя за другого.
 */
export function webhookSecret(base: string, provider: string): string | undefined {
  const key = `${base}_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[key] || process.env[base] || undefined;
}

/**
 * Проверка подписи входящего webhook.
 * Рекомендуемый формат: X-CargoFlow-Timestamp (unix, секунды) + подпись HMAC-SHA256(`${timestamp}.${body}`) —
 * старые запросы (старше 5 минут) отклоняются, поэтому перехваченный запрос нельзя повторить.
 * Формат без метки времени (HMAC тела) поддерживается для совместимости, пока не задан WEBHOOK_REQUIRE_TIMESTAMP=1.
 */
export function verifySignedWebhook(
  body: string,
  headers: { get(name: string): string | null },
  secret: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  const signature = headers.get("x-cargoflow-signature");
  const ts = headers.get("x-cargoflow-timestamp");
  if (ts) {
    const seconds = Number(ts);
    if (!Number.isFinite(seconds) || Math.abs(now - seconds * 1000) > WEBHOOK_TOLERANCE_MS) return { ok: false, reason: "stale" };
    return verifyWebhookSignature(`${ts}.${body}`, signature, secret) ? { ok: true } : { ok: false, reason: "signature" };
  }
  if (process.env.WEBHOOK_REQUIRE_TIMESTAMP === "1") return { ok: false, reason: "timestamp-required" };
  return verifyWebhookSignature(body, signature, secret) ? { ok: true } : { ok: false, reason: "signature" };
}
