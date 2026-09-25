import { route } from "@/lib/api/handler";
import { markAllNotificationsRead } from "@/server/services/notification.service";

export const POST = route({}, async ({ actor }) => markAllNotificationsRead(actor));
