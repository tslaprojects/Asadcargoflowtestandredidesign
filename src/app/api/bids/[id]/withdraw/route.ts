import { route } from "@/lib/api/handler";
import { withdrawBid } from "@/server/services/bid.service";

export const POST = route<{ id: string }>({ idempotency: "bid.withdraw" }, async ({ actor, params }) => withdrawBid(actor, params.id));
