import { parseJson, route } from "@/lib/api/handler";
import { chatMessageSchema } from "@/lib/validation/order";
import { listMessages, sendMessage } from "@/server/services/chat.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) => {
  const sp = req.nextUrl.searchParams;
  return listMessages(actor, params.id, {
    before: sp.get("before"),
    after: sp.get("after"),
    limit: Math.min(100, Number(sp.get("limit") ?? 30) || 30),
  });
});

export const POST = route<{ id: string }>({ status: 201, idempotency: "chat.send" }, async ({ req, actor, params }) =>
  sendMessage(actor, params.id, await parseJson(req, chatMessageSchema)),
);
