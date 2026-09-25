import { parseJson, route } from "@/lib/api/handler";
import { verificationSubmitSchema } from "@/lib/validation/company";
import { submitVerification } from "@/server/services/company.service";

export const POST = route<{ id: string }>({ rateLimit: "critical" }, async ({ req, actor, params }) => {
  const { comment } = await parseJson(req, verificationSubmitSchema);
  return submitVerification(actor, params.id, comment);
});
