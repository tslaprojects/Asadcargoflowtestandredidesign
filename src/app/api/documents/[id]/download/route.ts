import { route } from "@/lib/api/handler";
import { fileResponse } from "@/lib/api/files";
import { getDocumentForDownload } from "@/server/services/document.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) => {
  const doc = await getDocumentForDownload(actor, params.id);
  return fileResponse(doc, req.nextUrl.searchParams.get("inline") === "1");
});
