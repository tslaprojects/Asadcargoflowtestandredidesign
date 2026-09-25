import { parseJson, route } from "@/lib/api/handler";
import { vehicleSchema } from "@/lib/validation/company";
import { deleteVehicle, updateVehicle } from "@/server/services/fleet.service";

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateVehicle(actor, params.id, await parseJson(req, vehicleSchema)),
);
export const DELETE = route<{ id: string }>({}, async ({ actor, params }) => deleteVehicle(actor, params.id));
