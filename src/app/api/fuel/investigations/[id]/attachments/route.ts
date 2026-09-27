import { route } from "@/lib/api/handler";
import { errors } from "@/lib/errors";
import { attachToInvestigation } from "@/server/services/fuel-investigation.service";

export const POST = route<{ id: string }>({ status: 201, rateLimit: "upload" }, async ({ req, actor, params }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw errors.validation("Выберите файл.", { file: ["Выберите файл"] });
  const note = form?.get("note");
  return attachToInvestigation(actor, params.id, {
    file,
    note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null,
  });
});
