import { AppError } from "@/lib/errors";

/** Разрешённые типы файлов MVP: расширение → допустимые MIME + сигнатура содержимого. */
const ALLOWED: Record<string, { mimes: string[]; sig: "pdf" | "jpeg" | "png" | "ole" | "zip" }> = {
  ".pdf": { mimes: ["application/pdf"], sig: "pdf" },
  ".jpg": { mimes: ["image/jpeg", "image/pjpeg"], sig: "jpeg" },
  ".jpeg": { mimes: ["image/jpeg", "image/pjpeg"], sig: "jpeg" },
  ".png": { mimes: ["image/png"], sig: "png" },
  ".doc": { mimes: ["application/msword"], sig: "ole" },
  ".docx": { mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], sig: "zip" },
  ".xls": { mimes: ["application/vnd.ms-excel"], sig: "ole" },
  ".xlsx": { mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], sig: "zip" },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.join(",");

function matchesSignature(buf: Buffer, sig: string): boolean {
  const b = (i: number) => buf[i];
  switch (sig) {
    case "pdf":
      return buf.subarray(0, 5).toString("latin1") === "%PDF-";
    case "jpeg":
      return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    case "png":
      return b(0) === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG";
    case "ole":
      return b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0;
    case "zip":
      return b(0) === 0x50 && b(1) === 0x4b && b(2) === 0x03 && b(3) === 0x04;
    default:
      return false;
  }
}

export function maxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 15);
  return (Number.isFinite(mb) && mb > 0 ? mb : 15) * 1024 * 1024;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]+/g, "_").trim();
  return (cleaned || "file").slice(0, 180);
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export type ValidatedFile = { filename: string; ext: string; mimeType: string; size: number; buffer: Buffer };

/** Серверная проверка файла: расширение, MIME, размер и сигнатура содержимого. */
export async function validateUpload(file: File | null | undefined, opts: { imagesOnly?: boolean } = {}): Promise<ValidatedFile> {
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    throw new AppError("DOCUMENT_NOT_ALLOWED", "Файл не передан.");
  }
  const filename = sanitizeFilename(file.name);
  const ext = extensionOf(filename);
  const rule = ALLOWED[ext];
  if (!rule || (opts.imagesOnly && rule.sig !== "jpeg" && rule.sig !== "png")) {
    throw new AppError(
      "DOCUMENT_NOT_ALLOWED",
      opts.imagesOnly
        ? "Допустимы только изображения JPG и PNG."
        : "Недопустимый тип файла. Разрешены: PDF, JPG, JPEG, PNG, DOC, DOCX, XLS, XLSX.",
    );
  }
  if (file.size <= 0) throw new AppError("DOCUMENT_NOT_ALLOWED", "Файл пустой.");
  if (file.size > maxUploadBytes()) {
    throw new AppError(
      "DOCUMENT_NOT_ALLOWED",
      `Файл слишком большой. Максимальный размер — ${Math.round(maxUploadBytes() / 1024 / 1024)} МБ.`,
    );
  }
  const declared = (file.type || "").toLowerCase();
  if (declared && declared !== "application/octet-stream" && !rule.mimes.includes(declared)) {
    throw new AppError("DOCUMENT_NOT_ALLOWED", "Тип содержимого файла не соответствует его расширению.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(buffer, rule.sig)) {
    throw new AppError("DOCUMENT_NOT_ALLOWED", "Содержимое файла не соответствует его типу.");
  }
  return { filename, ext, mimeType: rule.mimes[0], size: buffer.length, buffer };
}
