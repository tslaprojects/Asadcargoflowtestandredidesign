import { route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { processConfirmationTimeouts } from "@/server/services/secure-deal.service";

/** Администратор вручную запускает обработку истёкших сроков проверки. */
export const POST = route({ rateLimit: "critical" }, async ({ actor }) => {
  if (!actor.isAdmin || !actor.permissions.has("ADMIN_PAYMENTS")) throw errors.forbidden();
  return processConfirmationTimeouts(new Date(), actor);
});
