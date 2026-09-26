import { route } from "@/lib/api/handler";
import { cancelSecureDeal } from "@/server/services/secure-deal.service";

export const POST = route<{ id: string }>({ idempotency: "secure-deal.cancel", rateLimit: "critical" }, async ({ actor, params }) =>
  cancelSecureDeal(actor, params.id),
);
