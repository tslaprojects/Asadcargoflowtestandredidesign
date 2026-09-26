import { parseQuery, route } from "@/lib/api/handler";
import { matchQuerySchema } from "@/lib/validation/next-load";
import { getMovementMatches } from "@/server/services/next-load.service";

export const GET = route<{ id: string }>({}, async ({ req, actor, params }) =>
  getMovementMatches(actor, params.id, parseQuery(req, matchQuerySchema).sort),
);
