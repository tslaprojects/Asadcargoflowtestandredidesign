import { parseJson, route } from "@/lib/api/handler";
import { signContractSchema } from "@/lib/validation/order";
import { signContract } from "@/server/services/contract.service";

export const POST = route<{ id: string }>({ idempotency: "contract.sign", rateLimit: "critical" }, async ({ req, actor, params }) => {
  const input = await parseJson(req, signContractSchema);
  return signContract(actor, params.id, input);
});
