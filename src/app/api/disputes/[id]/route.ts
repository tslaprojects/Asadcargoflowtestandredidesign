import { parseJson, route } from "@/lib/api/handler";
import { disputeUpdateSchema } from "@/lib/validation/order";
import { getDispute, updateDispute } from "@/server/services/dispute.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getDispute(actor, params.id));

export const PATCH = route<{ id: string }>({ idempotency: "dispute.update" }, async ({ req, actor, params }) =>
  updateDispute(actor, params.id, await parseJson(req, disputeUpdateSchema)),
);
