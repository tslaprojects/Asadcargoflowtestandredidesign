import type { NextRequest } from "next/server";
import { runWithDataMode } from "@/lib/db/data-mode";
import { fail, ok } from "@/lib/api/response";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifySignedWebhook, webhookSecret } from "@/lib/payments/provider";
import { telemetryIngestSchema } from "@/lib/validation/fuel";
import { ingestFromDevice } from "@/server/services/telemetry.service";

/**
 * Приём показаний от телематического провайдера/устройства (GPS, двигатель, одометр, уровень топлива CAN/датчик).
 * Подпись: X-CargoFlow-Signature = hex(HMAC-SHA256(тело, TELEMATICS_WEBHOOK_SECRET)). Дубликаты показаний игнорируются.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  // Внешние провайдеры работают с реальными данными; демо-режим использует встроенные симуляторы.
  return runWithDataMode("real", async () => {
    const { provider } = await ctx.params;
    const secret = webhookSecret("TELEMATICS_WEBHOOK_SECRET", provider);
    if (!secret) return fail("FORBIDDEN", "Приём телематики не настроен.", 403);
    const raw = await req.text();
    const check = verifySignedWebhook(raw, req.headers, secret);
    if (!check.ok) return fail("UNAUTHORIZED", "Неверная подпись.", 401);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail("VALIDATION_ERROR", "Некорректный JSON.", 422);
    }
    const parsed = telemetryIngestSchema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Некорректные данные.", 422);
    try {
      return ok(await ingestFromDevice(provider, parsed.data.deviceId, parsed.data.readings));
    } catch (e) {
      if (isAppError(e)) return fail(e.code, e.message, e.status);
      logger.error("telematics.ingest.failed", { provider, error: e });
      return fail("INTERNAL_ERROR", "Ошибка обработки.", 500);
    }
  });
}
