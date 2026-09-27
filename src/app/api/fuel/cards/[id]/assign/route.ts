import { parseJson, route } from "@/lib/api/handler";
import { fuelCardAssignSchema } from "@/lib/validation/fuel";
import { assignFuelCard } from "@/server/services/fuel-card.service";

export const PUT = route<{ id: string }>({}, async ({ req, actor, params }) =>
  assignFuelCard(actor, params.id, await parseJson(req, fuelCardAssignSchema)),
);
