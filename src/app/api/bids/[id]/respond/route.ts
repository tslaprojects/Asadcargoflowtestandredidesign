import { parseJson, route } from "@/lib/api/handler";
import { bidRespondSchema } from "@/lib/validation/bid";
import { respondToCounter } from "@/server/services/bid.service";

export const POST = route<{ id: string }>({ idempotency: "bid.respond" }, async ({ req, actor, params }) =>
  respondToCounter(actor, params.id, await parseJson(req, bidRespondSchema)),
);
