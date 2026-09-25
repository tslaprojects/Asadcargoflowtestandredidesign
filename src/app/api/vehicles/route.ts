import { z } from "zod";
import { parseJson, parseQuery, route } from "@/lib/api/handler";
import { vehicleSchema } from "@/lib/validation/company";
import { createVehicle, listVehicles } from "@/server/services/fleet.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(50).optional(),
  status: z.enum(["AVAILABLE", "ASSIGNED", "INACTIVE", "MAINTENANCE"]).optional(),
});

export const GET = route({}, async ({ req, actor }) => listVehicles(actor, parseQuery(req, q)));
export const POST = route({ status: 201, idempotency: "vehicle.create" }, async ({ req, actor }) =>
  createVehicle(actor, await parseJson(req, vehicleSchema)),
);
