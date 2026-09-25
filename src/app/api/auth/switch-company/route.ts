import { z } from "zod";
import { parseJson, route } from "@/lib/api/handler";
import { switchCompany } from "@/server/services/auth.service";

export const POST = route({}, async ({ req, actor }) => {
  const { companyId } = await parseJson(req, z.object({ companyId: z.uuid() }));
  return switchCompany(actor, companyId);
});
