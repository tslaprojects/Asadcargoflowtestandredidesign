import { parseJson, route } from "@/lib/api/handler";
import { fuelTxActionSchema } from "@/lib/validation/fuel";
import { fuelTransactionAction } from "@/server/services/fuel-transaction.service";

export const POST = route<{ id: string }>({ idempotency: "fuel.tx.action", rateLimit: "critical" }, async ({ req, actor, params }) => {
  const { action, reason } = await parseJson(req, fuelTxActionSchema);
  return fuelTransactionAction(actor, params.id, action, reason);
});
