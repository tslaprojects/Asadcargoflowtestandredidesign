import { parseJson, route } from "@/lib/api/handler";
import { profileUpdateSchema } from "@/lib/validation/auth";
import { updateProfile } from "@/server/services/auth.service";

export const PATCH = route({}, async ({ req, actor }) => updateProfile(actor, await parseJson(req, profileUpdateSchema)));
