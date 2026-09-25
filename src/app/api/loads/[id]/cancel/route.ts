import { parseJson, route } from "@/lib/api/handler";
import { loadCancelSchema } from "@/lib/validation/load";
import { cancelLoad } from "@/server/services/load.service";

export const POST = route<{ id: string }>({ idempotency: "load.cancel" }, async ({ req, actor, params }) => {
  const { reason } = await parseJson(req, loadCancelSchema);
  return cancelLoad(actor, params.id, reason);
});
