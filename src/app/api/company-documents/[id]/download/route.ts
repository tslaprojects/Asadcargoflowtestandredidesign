import { route } from "@/lib/api/handler";
import { fileResponse } from "@/lib/api/files";
import { getCompanyDocumentFile } from "@/server/services/company.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) => {
  const doc = await getCompanyDocumentFile(actor, params.id);
  return fileResponse(doc, req.nextUrl.searchParams.get("inline") === "1");
});
