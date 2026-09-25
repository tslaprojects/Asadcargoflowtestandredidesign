import { route } from "@/lib/api/handler";
import { getMyTrip } from "@/server/services/driver-trip.service";

export const GET = route({}, async ({ actor }) => getMyTrip(actor));
