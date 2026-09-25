import { z } from "zod";
import { parseJson, parseQuery, route } from "@/lib/api/handler";
import { loadInputSchema, loadListQuerySchema } from "@/lib/validation/load";
import { createLoad, listLoads } from "@/server/services/load.service";

export const GET = route({}, async ({ req, actor }) => listLoads(actor, parseQuery(req, loadListQuerySchema)));

export const POST = route({ status: 201, idempotency: "load.create", rateLimit: "critical" }, async ({ req, actor }) => {
  const body = await parseJson(req, z.object({ load: loadInputSchema, publish: z.boolean().default(false) }));
  return createLoad(actor, body.load, { publish: body.publish });
});
