import { parseJson, route } from "@/lib/api/handler";
import { assignDriverSchema } from "@/lib/validation/order";
import { assignDriver, driverOptionsForOrder, unassignDriver } from "@/server/services/order.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => driverOptionsForOrder(actor, params.id));

export const POST = route<{ id: string }>({ idempotency: "order.driver" }, async ({ req, actor, params }) => {
  const { driverId } = await parseJson(req, assignDriverSchema);
  return assignDriver(actor, params.id, driverId);
});

export const DELETE = route<{ id: string }>({}, async ({ actor, params }) => unassignDriver(actor, params.id));
