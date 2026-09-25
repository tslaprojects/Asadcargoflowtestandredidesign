import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { adminListAudit } from "@/server/services/admin.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(100).optional(),
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  userId: z.uuid().optional(),
});

export const GET = route({}, async ({ req, actor }) => adminListAudit(actor, parseQuery(req, q)));
