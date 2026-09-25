import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { listDisputes } from "@/server/services/dispute.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]).optional(),
});

export const GET = route({}, async ({ req, actor }) => listDisputes(actor, parseQuery(req, q)));
