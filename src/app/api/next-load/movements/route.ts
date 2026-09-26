import { parseJson, route } from "@/lib/api/handler";
import { plannedMovementSchema } from "@/lib/validation/next-load";
import { createMovement } from "@/server/services/next-load.service";

export const POST = route({ status: 201, idempotency: "next-load.movement" }, async ({ req, actor }) =>
  createMovement(actor, await parseJson(req, plannedMovementSchema)),
);
