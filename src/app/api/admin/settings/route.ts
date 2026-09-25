import { parseJson, route } from "@/lib/api/handler";
import { requirePermission } from "@/lib/auth/actor";
import { platformSettingsSchema } from "@/lib/validation/company";
import { getSettings, updateSettings } from "@/server/services/settings.service";

export const GET = route({}, async ({ actor }) => {
  requirePermission(actor, "ADMIN_SETTINGS");
  return getSettings();
});

export const PUT = route({}, async ({ req, actor }) => updateSettings(actor, await parseJson(req, platformSettingsSchema)));
