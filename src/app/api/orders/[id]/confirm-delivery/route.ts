import { parseJson, route } from "@/lib/api/handler";
import { confirmDeliverySchema } from "@/lib/validation/order";
import { confirmDelivery } from "@/server/services/order.service";

export const POST = route<{ id: string }>({ idempotency: "order.confirm" }, async ({ req, actor, params }) => {
  const { comment } = await parseJson(req, confirmDeliverySchema);
  return confirmDelivery(actor, params.id, comment);
});
