import { parseJson, route } from "@/lib/api/handler";
import { adminPaymentOperationSchema } from "@/lib/validation/order";
import { adminRelease } from "@/server/services/secure-deal.service";

export const POST = route<{ id: string }>(
  { idempotency: "secure-deal.admin-release", rateLimit: "critical" },
  async ({ req, actor, params }) => adminRelease(actor, params.id, await parseJson(req, adminPaymentOperationSchema)),
);
