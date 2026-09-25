import { route } from "@/lib/api/handler";
import { logout } from "@/server/services/auth.service";

export const POST = route({ auth: false }, async ({ actor }) => {
  await logout(actor);
  return { ok: true };
});
