import { parseJson, route } from "@/lib/api/handler";
import { orderCancelSchema } from "@/lib/validation/order";
import { cancelOrder } from "@/server/services/order.service";

export const POST = route<{ id: string }>({ idempotency: "order.cancel" }, async ({ req, actor, params }) => {
  const { reason } = await parseJson(req, orderCancelSchema);
  return cancelOrder(actor, params.id, reason);
});
