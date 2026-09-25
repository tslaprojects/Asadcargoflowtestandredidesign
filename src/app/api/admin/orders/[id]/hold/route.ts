import { z } from "zod";
import { parseJson, route } from "@/lib/api/handler";
import { adminHoldOrder } from "@/server/services/admin.service";

export const POST = route<{ id: string }>({}, async ({ req, actor, params }) => {
  const { hold, comment } = await parseJson(
    req,
    z.object({ hold: z.boolean(), comment: z.string().trim().max(500).optional().nullable() }),
  );
  return adminHoldOrder(actor, params.id, hold, comment ?? null);
});
