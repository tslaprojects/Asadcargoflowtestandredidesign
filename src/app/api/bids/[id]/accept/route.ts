import { route } from "@/lib/api/handler";
import { acceptBid } from "@/server/services/bid.service";

export const POST = route<{ id: string }>({ idempotency: "bid.accept", rateLimit: "critical" }, async ({ actor, params }) =>
  acceptBid(actor, params.id),
);
