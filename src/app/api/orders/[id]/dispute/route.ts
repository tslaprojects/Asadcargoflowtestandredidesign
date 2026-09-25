import { parseJson, route } from "@/lib/api/handler";
import { disputeCreateSchema } from "@/lib/validation/order";
import { openDispute } from "@/server/services/dispute.service";

export const POST = route<{ id: string }>({ status: 201, idempotency: "dispute.open" }, async ({ req, actor, params }) =>
  openDispute(actor, params.id, await parseJson(req, disputeCreateSchema)),
);
