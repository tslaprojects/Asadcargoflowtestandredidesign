import { parseJson, route } from "@/lib/api/handler";
import { registerSchema } from "@/lib/validation/auth";
import { register } from "@/server/services/auth.service";

export const POST = route({ auth: false, status: 201 }, async ({ req, meta }) => {
  const res = await register(await parseJson(req, registerSchema), meta);
  // Dashboard сам перенаправит водителя в «Мой рейс»
  return { ...res, redirectTo: "/dashboard" };
});
