import { route } from "@/lib/api/handler";
import { listMyTrips } from "@/server/services/driver-trip.service";

/** История рейсов водителя (без финансовых данных). */
export const GET = route({}, async ({ actor, req }) =>
  listMyTrips(actor, {
    page: Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1),
    pageSize: Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? 20) || 20)),
  }),
);
