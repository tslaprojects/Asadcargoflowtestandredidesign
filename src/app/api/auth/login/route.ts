import { parseJson, route } from "@/lib/api/handler";
import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/server/services/auth.service";

export const POST = route({ auth: false }, async ({ req, meta }) => login(await parseJson(req, loginSchema), meta));
