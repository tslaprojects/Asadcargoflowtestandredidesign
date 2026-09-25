import { parseJson, route } from "@/lib/api/handler";
import { assignVehicleSchema } from "@/lib/validation/order";
import { assignVehicle, unassignVehicle, vehicleOptionsForOrder } from "@/server/services/order.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => vehicleOptionsForOrder(actor, params.id));

export const POST = route<{ id: string }>({ idempotency: "order.vehicle" }, async ({ req, actor, params }) => {
  const { vehicleId } = await parseJson(req, assignVehicleSchema);
  return assignVehicle(actor, params.id, vehicleId);
});

export const DELETE = route<{ id: string }>({}, async ({ actor, params }) => unassignVehicle(actor, params.id));
