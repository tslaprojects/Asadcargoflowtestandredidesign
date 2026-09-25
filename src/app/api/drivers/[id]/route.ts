import { parseJson, route } from "@/lib/api/handler";
import { driverSchema } from "@/lib/validation/company";
import { updateDriver } from "@/server/services/fleet.service";

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateDriver(actor, params.id, await parseJson(req, driverSchema)),
);
