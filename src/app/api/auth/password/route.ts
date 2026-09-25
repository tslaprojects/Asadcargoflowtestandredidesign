import { parseJson, route } from "@/lib/api/handler";
import { changePasswordSchema } from "@/lib/validation/auth";
import { changePassword } from "@/server/services/auth.service";

export const POST = route({ rateLimit: "critical" }, async ({ req, actor }) =>
  changePassword(actor, await parseJson(req, changePasswordSchema)),
);
