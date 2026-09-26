import { route } from "@/lib/api/handler";
import { cancelMovement } from "@/server/services/next-load.service";

export const POST = route<{ id: string }>({}, async ({ actor, params }) => cancelMovement(actor, params.id));
