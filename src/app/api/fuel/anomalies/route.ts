import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { listAnomalies } from "@/server/services/fuel-investigation.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["OPEN", "CONFIRMED", "DISMISSED", "INVESTIGATING", "RESOLVED"]).optional(),
  vehicleId: z.uuid().optional(),
});

export const GET = route({}, async ({ req, actor }) => listAnomalies(actor, parseQuery(req, q)));
