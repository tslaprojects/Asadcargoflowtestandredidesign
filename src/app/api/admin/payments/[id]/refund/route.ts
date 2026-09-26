import { parseJson, route } from "@/lib/api/handler";
import { adminPaymentOperationSchema } from "@/lib/validation/order";
import { adminRefund } from "@/server/services/secure-deal.service";

export const POST = route<{ id: string }>(
  { idempotency: "secure-deal.admin-refund", rateLimit: "critical" },
  async ({ req, actor, params }) => adminRefund(actor, params.id, await parseJson(req, adminPaymentOperationSchema)),
);
