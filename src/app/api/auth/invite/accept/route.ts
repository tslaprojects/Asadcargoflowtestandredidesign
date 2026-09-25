import { parseJson, route } from "@/lib/api/handler";
import { acceptInviteSchema } from "@/lib/validation/auth";
import { acceptInviteForExistingUser } from "@/server/services/auth.service";

export const POST = route({}, async ({ req, actor }) => {
  const { token } = await parseJson(req, acceptInviteSchema);
  return acceptInviteForExistingUser(actor, token);
});
