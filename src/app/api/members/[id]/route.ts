import { parseJson, route } from "@/lib/api/handler";
import { memberUpdateSchema } from "@/lib/validation/company";
import { updateMember } from "@/server/services/company.service";

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateMember(actor, params.id, await parseJson(req, memberUpdateSchema)),
);
