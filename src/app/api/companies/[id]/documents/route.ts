import { z } from "zod";
import { readUploadForm, route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { uploadCompanyDocument } from "@/server/services/company.service";

const typeSchema = z.enum(["REGISTRATION", "TAX", "LICENSE", "OTHER"]);

export const POST = route<{ id: string }>({ rateLimit: "upload", status: 201 }, async ({ req, actor, params }) => {
  const form = await readUploadForm(req);
  const type = typeSchema.safeParse(form.get("type"));
  if (!type.success) throw errors.validation("Выберите тип документа.", { type: ["Выберите тип документа"] });
  return uploadCompanyDocument(actor, params.id, type.data, form.get("file") as File);
});
