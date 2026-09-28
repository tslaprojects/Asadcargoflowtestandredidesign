import { route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { runMaintenance } from "@/server/services/maintenance.service";
import { processConfirmationTimeouts } from "@/server/services/secure-deal.service";

/** Администратор вручную запускает обработку истёкших сроков проверки. */
export const POST = route({ rateLimit: "critical" }, async ({ actor }) => {
  if (!actor.isAdmin || !actor.permissions.has("ADMIN_PAYMENTS")) throw errors.forbidden();
  const result = await processConfirmationTimeouts(new Date(), actor);
  return { ...result, maintenance: await runMaintenance(new Date()) };
});
