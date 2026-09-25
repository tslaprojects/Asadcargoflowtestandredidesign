import { route } from "@/lib/api/handler";
import { deleteOrderDocument } from "@/server/services/document.service";

export const DELETE = route<{ id: string }>({ idempotency: "document.delete" }, async ({ actor, params }) =>
  deleteOrderDocument(actor, params.id),
);
