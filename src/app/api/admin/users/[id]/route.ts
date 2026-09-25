import { parseJson, route } from "@/lib/api/handler";
import { adminUserActionSchema } from "@/lib/validation/company";
import { adminGetUser, adminSetUserStatus } from "@/server/services/admin.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => adminGetUser(actor, params.id));

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) => {
  const { action, reason } = await parseJson(req, adminUserActionSchema);
  return adminSetUserStatus(actor, params.id, action, reason);
});
