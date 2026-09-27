import { parseJson, route } from "@/lib/api/handler";
import { investigationCommentSchema } from "@/lib/validation/fuel";
import { commentInvestigation } from "@/server/services/fuel-investigation.service";

export const POST = route<{ id: string }>({ status: 201 }, async ({ req, actor, params }) =>
  commentInvestigation(actor, params.id, (await parseJson(req, investigationCommentSchema)).message),
);
