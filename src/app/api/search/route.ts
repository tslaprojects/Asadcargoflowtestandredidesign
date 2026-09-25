import { route } from "@/lib/api/handler";
import { globalSearch } from "@/server/services/search.service";

export const GET = route({}, async ({ req, actor }) => globalSearch(actor, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100)));
