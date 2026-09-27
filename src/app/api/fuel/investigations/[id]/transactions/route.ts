import { parseJson, route } from "@/lib/api/handler";
import { investigationLinkSchema } from "@/lib/validation/fuel";
import { linkTransaction } from "@/server/services/fuel-investigation.service";

export const POST = route<{ id: string }>({ status: 201 }, async ({ req, actor, params }) =>
  linkTransaction(actor, params.id, (await parseJson(req, investigationLinkSchema)).fuelTransactionId),
);
