import { parseJson, route } from "@/lib/api/handler";
import { bidCounterSchema } from "@/lib/validation/bid";
import { counterBid } from "@/server/services/bid.service";

export const POST = route<{ id: string }>({ idempotency: "bid.counter" }, async ({ req, actor, params }) => {
  const { amount, message } = await parseJson(req, bidCounterSchema);
  return counterBid(actor, params.id, amount, message);
});
