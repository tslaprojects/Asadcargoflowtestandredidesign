import { z } from "zod";
import { parseJson, parseQuery, route } from "@/lib/api/handler";
import { driverSchema } from "@/lib/validation/company";
import { createDriver, listDrivers } from "@/server/services/fleet.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(50).optional(),
});

export const GET = route({}, async ({ req, actor }) => listDrivers(actor, parseQuery(req, q)));
export const POST = route({ status: 201, idempotency: "driver.create" }, async ({ req, actor }) =>
  createDriver(actor, await parseJson(req, driverSchema)),
);
