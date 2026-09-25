import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { adminListUsers } from "@/server/services/admin.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
});

export const GET = route({}, async ({ req, actor }) => adminListUsers(actor, parseQuery(req, q)));
