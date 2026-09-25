import { parseJson, route } from "@/lib/api/handler";
import { verificationDecisionSchema } from "@/lib/validation/company";
import { adminCompanyDecision } from "@/server/services/admin.service";

export const POST = route<{ id: string }>({ idempotency: "admin.company.decision" }, async ({ req, actor, params }) => {
  const { decision, comment } = await parseJson(req, verificationDecisionSchema);
  return adminCompanyDecision(actor, params.id, decision, comment);
});
