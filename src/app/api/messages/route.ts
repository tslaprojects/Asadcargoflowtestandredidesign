import { parseQuery, route } from "@/lib/api/handler";
import { paginationSchema } from "@/lib/validation/common";
import { listThreads } from "@/server/services/chat.service";

export const GET = route({}, async ({ req, actor }) => listThreads(actor, parseQuery(req, paginationSchema)));
