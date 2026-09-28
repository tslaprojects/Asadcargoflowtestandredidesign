import { z } from "zod";
import { readUploadForm, route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { uploadLoadDocument } from "@/server/services/load.service";

const typeSchema = z.enum(["APPLICATION", "INVOICE", "PACKING_LIST", "CARGO_PHOTO", "OTHER"]);

export const POST = route<{ id: string }>({ status: 201, rateLimit: "upload" }, async ({ req, actor, params }) => {
  const form = await readUploadForm(req);
  const type = typeSchema.safeParse(form.get("type"));
  if (!type.success) throw errors.validation("Выберите тип документа.", { type: ["Выберите тип документа"] });
  return uploadLoadDocument(actor, params.id, type.data, form.get("file") as File);
});
