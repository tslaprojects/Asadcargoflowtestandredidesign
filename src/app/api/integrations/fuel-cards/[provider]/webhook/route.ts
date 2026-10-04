import type { NextRequest } from "next/server";
import { runWithDataMode } from "@/lib/db/data-mode";
import { fail, ok } from "@/lib/api/response";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifySignedWebhook, webhookSecret } from "@/lib/payments/provider";
import { fuelProviderEventSchema } from "@/lib/validation/fuel";
import { handleProviderEvent } from "@/server/services/fuel-transaction.service";

/**
 * Процессинг топливных карт → CargoFlow: запрос авторизации (ответ: разрешить/отклонить по лимитам), завершение, отмена, возврат.
 * Подпись: X-CargoFlow-Signature = hex(HMAC-SHA256(тело, FUEL_CARD_WEBHOOK_SECRET)). Повторная доставка безопасна.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  // Внешние провайдеры работают с реальными данными; демо-режим использует встроенные симуляторы.
  return runWithDataMode("real", async () => {
    const { provider } = await ctx.params;
    const secret = webhookSecret("FUEL_CARD_WEBHOOK_SECRET", provider);
    if (!secret) return fail("FORBIDDEN", "Интеграция с процессингом топливных карт не настроена.", 403);
    const raw = await req.text();
    const check = verifySignedWebhook(raw, req.headers, secret);
    if (!check.ok) {
      logger.warn("fuel.webhook.bad-signature", { provider, reason: check.reason });
      return fail("UNAUTHORIZED", "Неверная подпись.", 401);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail("VALIDATION_ERROR", "Некорректный JSON.", 422);
    }
    const parsed = fuelProviderEventSchema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Некорректные данные.", 422);
    try {
      return ok(await handleProviderEvent(provider, parsed.data));
    } catch (e) {
      if (isAppError(e)) return fail(e.code, e.message, e.status);
      logger.error("fuel.webhook.failed", { provider, error: e });
      return fail("INTERNAL_ERROR", "Ошибка обработки.", 500);
    }
  });
}
