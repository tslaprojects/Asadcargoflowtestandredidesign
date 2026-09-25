import { parseJson, route } from "@/lib/api/handler";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPassword } from "@/server/services/auth.service";

export const POST = route({ auth: false }, async ({ req, meta }) => resetPassword(await parseJson(req, resetPasswordSchema), meta));
