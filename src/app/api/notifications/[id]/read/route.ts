import { route } from "@/lib/api/handler";
import { markNotificationRead } from "@/server/services/notification.service";

export const POST = route<{ id: string }>({}, async ({ actor, params }) => markNotificationRead(actor, params.id));
