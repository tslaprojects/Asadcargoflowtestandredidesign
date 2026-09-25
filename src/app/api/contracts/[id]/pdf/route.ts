import { route } from "@/lib/api/handler";
import { getContractPdf } from "@/server/services/contract.service";

export const GET = route<{ id: string }>({}, async ({ actor, params, req }) => {
  const { bytes, filename } = await getContractPdf(actor, params.id);
  const inline = req.nextUrl.searchParams.get("download") !== "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
