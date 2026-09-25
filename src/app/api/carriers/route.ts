import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { listCarriers } from "@/server/services/company.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(100).optional(),
  verifiedOnly: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const GET = route({}, async ({ req, actor }) => listCarriers(actor, parseQuery(req, q)));
