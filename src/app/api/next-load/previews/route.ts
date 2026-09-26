import { route } from "@/lib/api/handler";
import { nextLoadPreviews } from "@/server/services/next-load.service";

export const GET = route({}, async ({ actor }) => nextLoadPreviews(actor));
