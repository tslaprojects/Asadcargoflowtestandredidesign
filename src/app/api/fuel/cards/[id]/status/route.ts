import { parseJson, route } from "@/lib/api/handler";
import { fuelCardStatusSchema } from "@/lib/validation/fuel";
import { setFuelCardStatus } from "@/server/services/fuel-card.service";

export const POST = route<{ id: string }>({}, async ({ req, actor, params }) => {
  const { status, reason } = await parseJson(req, fuelCardStatusSchema);
  return setFuelCardStatus(actor, params.id, status, reason);
});
