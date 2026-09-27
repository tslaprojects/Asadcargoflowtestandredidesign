import { route } from "@/lib/api/handler";
import { getAnomaly } from "@/server/services/fuel-investigation.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => getAnomaly(actor, params.id));
