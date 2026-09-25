import { parseJson, route } from "@/lib/api/handler";
import { bidCreateSchema } from "@/lib/validation/bid";
import { createBid } from "@/server/services/bid.service";
import { getLoadDetail } from "@/server/services/load.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => {
  const { bids } = await getLoadDetail(actor, params.id);
  return bids;
});

export const POST = route<{ id: string }>(
  { status: 201, idempotency: "bid.create", rateLimit: "critical" },
  async ({ req, actor, params }) => createBid(actor, params.id, await parseJson(req, bidCreateSchema)),
);
