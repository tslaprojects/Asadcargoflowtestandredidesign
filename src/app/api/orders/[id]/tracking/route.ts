import { parseJson, route } from "@/lib/api/handler";
import { trackingSchema } from "@/lib/validation/order";
import { addLocation, listTracking } from "@/server/services/tracking.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) =>
  listTracking(actor, params.id, { limit: Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50) }),
);

export const POST = route<{ id: string }>({ status: 201, rateLimit: "critical" }, async ({ req, actor, params }) =>
  addLocation(actor, params.id, await parseJson(req, trackingSchema)),
);
