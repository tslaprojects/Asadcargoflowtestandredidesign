import { z } from "zod";
import { route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { listOrderDocuments, uploadOrderDocument } from "@/server/services/document.service";

const typeSchema = z.enum([
  "APPLICATION",
  "CMR",
  "INVOICE",
  "PACKING_LIST",
  "VEHICLE_DOCUMENT",
  "DRIVER_DOCUMENT",
  "CARGO_PHOTO",
  "SEAL_PHOTO",
  "PROOF_OF_DELIVERY",
  "OTHER",
]);

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) =>
  listOrderDocuments(actor, params.id, {
    includeHistory: req.nextUrl.searchParams.get("history") === "1",
    page: Number(req.nextUrl.searchParams.get("page") ?? 1) || 1,
  }),
);

export const POST = route<{ id: string }>({ status: 201, rateLimit: "upload" }, async ({ req, actor, params }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw errors.validation("Ожидается multipart/form-data.");
  const type = typeSchema.safeParse(form.get("type"));
  if (!type.success) throw errors.validation("Выберите тип документа.", { type: ["Выберите тип документа"] });
  const note = (form.get("note") as string | null)?.slice(0, 500) || null;
  const replacesId = (form.get("replacesId") as string | null) || null;
  if (replacesId && !z.uuid().safeParse(replacesId).success) throw errors.validation("Некорректный документ для замены.");
  return uploadOrderDocument(actor, params.id, { type: type.data, file: form.get("file") as File, note, replacesId });
});
