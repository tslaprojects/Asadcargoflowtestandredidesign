import { parseJson, route } from "@/lib/api/handler";
import { fuelCardLimitsSchema } from "@/lib/validation/fuel";
import { updateFuelCardLimits } from "@/server/services/fuel-card.service";

export const PUT = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateFuelCardLimits(actor, params.id, await parseJson(req, fuelCardLimitsSchema)),
);
