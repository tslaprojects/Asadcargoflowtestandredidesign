import { parseJson, route } from "@/lib/api/handler";
import { statusChangeSchema } from "@/lib/validation/order";
import { changeStatus } from "@/server/services/order.service";

export const POST = route<{ id: string }>({ idempotency: "order.status", rateLimit: "critical" }, async ({ req, actor, params }) =>
  changeStatus(actor, params.id, await parseJson(req, statusChangeSchema)),
);
