import { parseJson, route } from "@/lib/api/handler";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/server/services/auth.service";

export const POST = route({ auth: false }, async ({ req, meta }) => {
  const { email } = await parseJson(req, forgotPasswordSchema);
  return requestPasswordReset(email, meta);
});
