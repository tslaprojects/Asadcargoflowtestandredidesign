import { parseJson, route } from "@/lib/api/handler";
import { investigationUpdateSchema } from "@/lib/validation/fuel";
import { getInvestigation, updateInvestigation } from "@/server/services/fuel-investigation.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getInvestigation(actor, params.id));

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateInvestigation(actor, params.id, await parseJson(req, investigationUpdateSchema)),
);
