import { parseJson, route } from "@/lib/api/handler";
import { deliverSchema } from "@/lib/validation/order";
import { reportDelivered } from "@/server/services/order.service";

export const POST = route<{ id: string }>({ idempotency: "order.deliver" }, async ({ req, actor, params }) =>
  reportDelivered(actor, params.id, await parseJson(req, deliverSchema)),
);
