import { route } from "@/lib/api/handler";
import { publishLoad } from "@/server/services/load.service";

export const POST = route<{ id: string }>({ idempotency: "load.publish" }, async ({ actor, params }) => publishLoad(actor, params.id));
