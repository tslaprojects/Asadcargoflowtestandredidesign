import { parseJson, route } from "@/lib/api/handler";
import { bidAcceptSchema } from "@/lib/validation/bid";
import { acceptBid } from "@/server/services/bid.service";

export const POST = route<{ id: string }>({ idempotency: "bid.accept", rateLimit: "critical" }, async ({ req, actor, params }) => {
  const { expectedAmount, expectedCurrency } = await parseJson(req, bidAcceptSchema);
  return acceptBid(actor, params.id, { amount: expectedAmount, currency: expectedCurrency });
});
