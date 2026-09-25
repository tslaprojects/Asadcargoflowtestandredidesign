import { z } from "zod";
import { parseJson, route } from "@/lib/api/handler";
import { emailSchema } from "@/lib/validation/auth";
import { inviteDriver } from "@/server/services/fleet.service";

export const POST = route<{ id: string }>({ status: 201, rateLimit: "critical" }, async ({ req, actor, params }) => {
  const { email } = await parseJson(req, z.object({ email: emailSchema }));
  return inviteDriver(actor, params.id, email);
});
