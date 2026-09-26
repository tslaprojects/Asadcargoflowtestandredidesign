import { route } from "@/lib/api/handler";
import { nextLoadContext } from "@/server/services/next-load.service";

export const GET = route({}, async ({ actor }) => nextLoadContext(actor));
