import { parseJson, route } from "@/lib/api/handler";
import { adminConfirmTransactionSchema } from "@/lib/validation/order";
import { adminConfirmTransaction } from "@/server/services/secure-deal.service";

export const POST = route<{ id: string }>(
  { idempotency: "secure-deal.admin-confirm", rateLimit: "critical" },
  async ({ req, actor, params }) => adminConfirmTransaction(actor, params.id, await parseJson(req, adminConfirmTransactionSchema)),
);
