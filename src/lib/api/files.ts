import "server-only";
import { storage } from "@/lib/storage/storage";

type StoredFile = { storageKey: string; filename: string; mimeType: string };

/**
 * Защищённая выдача файла (вызывается только после проверки прав).
 * S3: короткоживущая подписанная ссылка; local: поток через сервер.
 */
export async function fileResponse(file: StoredFile, inline = false): Promise<Response> {
  const s = storage();
  const signed = inline ? null : await s.signedUrl(file.storageKey, file.filename, file.mimeType, 60);
  if (signed) return Response.redirect(signed, 302);
  const data = await s.get(file.storageKey);
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
