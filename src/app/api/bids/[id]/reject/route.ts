import { parseJson, route } from "@/lib/api/handler";
import { bidRejectSchema } from "@/lib/validation/bid";
import { rejectBid } from "@/server/services/bid.service";

export const POST = route<{ id: string }>({ idempotency: "bid.reject" }, async ({ req, actor, params }) => {
  const { reason } = await parseJson(req, bidRejectSchema);
  return rejectBid(actor, params.id, reason);
});
