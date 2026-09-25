import { z } from "zod";
import { parseQuery, route } from "@/lib/api/handler";
import { listNotifications } from "@/server/services/notification.service";

const q = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const GET = route({}, async ({ req, actor }) => listNotifications(actor, parseQuery(req, q)));
