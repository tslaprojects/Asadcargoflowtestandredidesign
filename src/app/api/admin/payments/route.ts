import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { SECURE_DEAL_STATUSES } from "@/lib/state-machine/payment-state-machine";
import { listSecureDeals } from "@/server/services/secure-deal.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(SECURE_DEAL_STATUSES as [string, ...string[]]).optional(),
});

export const GET = route({}, async ({ req, actor }) => listSecureDeals(actor, parseQuery(req, q)));
