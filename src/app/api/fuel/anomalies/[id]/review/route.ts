import { parseJson, route } from "@/lib/api/handler";
import { anomalyReviewSchema } from "@/lib/validation/fuel";
import { reviewAnomaly } from "@/server/services/fuel-investigation.service";

export const POST = route<{ id: string }>({}, async ({ req, actor, params }) =>
  reviewAnomaly(actor, params.id, await parseJson(req, anomalyReviewSchema)),
);
