import { parseJson, route } from "@/lib/api/handler";
import { disputeCommentSchema } from "@/lib/validation/order";
import { commentDispute } from "@/server/services/dispute.service";

export const POST = route<{ id: string }>({ status: 201 }, async ({ req, actor, params }) => {
  const { message } = await parseJson(req, disputeCommentSchema);
  return commentDispute(actor, params.id, message);
});
