import { parseJson, route } from "@/lib/api/handler";
import { loadInputSchema } from "@/lib/validation/load";
import { getLoadDetail, updateLoad } from "@/server/services/load.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getLoadDetail(actor, params.id));

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateLoad(actor, params.id, await parseJson(req, loadInputSchema)),
);
