import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/lib/payments/provider";
import { providerWebhookSchema } from "@/lib/validation/order";
import { handleProviderWebhook } from "@/server/services/secure-deal.service";

/**
 * Webhook платёжного провайдера: результат операции (по ключу идемпотентности CargoFlow).
 * Подпись: X-CargoFlow-Signature = hex(HMAC-SHA256(тело запроса, PAYMENT_WEBHOOK_SECRET)).
 * Повторная доставка того же результата безопасна — операция применяется один раз.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return fail("FORBIDDEN", "Webhook платёжного провайдера не настроен.", 403);
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-cargoflow-signature"), secret)) {
    logger.warn("payment.webhook.bad-signature", { provider });
    return fail("UNAUTHORIZED", "Неверная подпись.", 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("VALIDATION_ERROR", "Некорректный JSON.", 422);
  }
  const parsed = providerWebhookSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Некорректные данные webhook.", 422);
  try {
    return ok(await handleProviderWebhook(provider, parsed.data));
  } catch (e) {
    if (isAppError(e)) return fail(e.code, e.message, e.status);
    logger.error("payment.webhook.failed", { provider, error: e });
    return fail("INTERNAL_ERROR", "Ошибка обработки.", 500);
  }
}
