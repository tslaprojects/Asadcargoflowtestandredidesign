import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { DATA_MODES, runWithDataMode } from "@/lib/db/data-mode";
import { logger } from "@/lib/logger";
import { demoWorkspaceReady } from "@/server/services/demo-workspace.service";
import { runMaintenance } from "@/server/services/maintenance.service";
import { processConfirmationTimeouts } from "@/server/services/secure-deal.service";

/**
 * Плановая задача (cron): истёкшие сроки проверки после доставки → автоподтверждение и выплата.
 * Вызов: POST /api/system/jobs/secure-deal с заголовком Authorization: Bearer $CRON_SECRET.
 * Без настроенного CRON_SECRET endpoint отключён.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("FORBIDDEN", "Плановые задачи отключены: не задан CRON_SECRET.", 403);
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return fail("UNAUTHORIZED", "Неверный ключ плановой задачи.", 401);
  }
  try {
    // Задача обслуживает обе базы — каждую в своём контексте режима (данные не смешиваются).
    const byMode: Record<string, unknown> = {};
    for (const mode of DATA_MODES) {
      if (mode === "demo" && !(await demoWorkspaceReady())) continue;
      byMode[mode] = await runWithDataMode(mode, async () => {
        const result = await processConfirmationTimeouts(new Date(), null);
        logger.info("job.secure-deal.timeouts", { mode, ...result });
        const maintenance = await runMaintenance(new Date()).catch((e) => {
          logger.error("job.maintenance.failed", { mode, error: e });
          return null;
        });
        return { ...result, maintenance };
      });
    }
    return ok(byMode);
  } catch (e) {
    logger.error("job.secure-deal.failed", { error: e });
    return fail("INTERNAL_ERROR", "Ошибка выполнения задачи.", 500);
  }
}
