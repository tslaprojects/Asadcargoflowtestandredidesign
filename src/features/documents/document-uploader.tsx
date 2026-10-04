"use client";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";
import { formatFileSize } from "@/lib/format";
import { label } from "@/lib/i18n";
import { ACCEPT_ATTRIBUTE } from "@/lib/storage/file-validation";

export type UploadedDoc = { id: string; filename: string; type: string };

/**
 * Загрузка документа: тип, файл, комментарий. Проверка типа/размера выполняется на сервере
 * (MIME, расширение, сигнатура содержимого, размер).
 */
export function DocumentUploader({
  url,
  types,
  defaultType,
  replacesId,
  onUploaded,
  compact,
  imagesOnlyHint,
  capture,
  refresh = true,
  submitLabel = "Загрузить документ",
  labelEnum = "DocumentType",
}: {
  url: string;
  types: string[];
  defaultType?: string;
  replacesId?: string;
  onUploaded?: (doc: UploadedDoc) => void;
  compact?: boolean;
  imagesOnlyHint?: boolean;
  capture?: boolean;
  refresh?: boolean;
  submitLabel?: string;
  labelEnum?: "DocumentType" | "CompanyDocumentType";
}) {
  const router = useRouter();
  const [type, setType] = React.useState(defaultType ?? types[0]);
  const [file, setFile] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  const upload = async () => {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("type", type);
    fd.set("file", file);
    if (note) fd.set("note", note);
    if (replacesId) fd.set("replacesId", replacesId);
    try {
      const doc = await api<UploadedDoc>(url, { method: "POST", formData: fd });
      toast.success("Документ загружен");
      setFile(null);
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.(doc);
      if (refresh) router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const isImageType = type === "CARGO_PHOTO" || type === "SEAL_PHOTO";

  return (
    <div className="space-y-3" data-testid="document-uploader">
      <FormError message={error} />
      <div className={compact ? "grid gap-2" : "grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]"}>
        {types.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-type`}>Тип документа</Label>
            <NativeSelect id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {label(labelEnum, t)}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>Файл</Label>
          <Input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept={isImageType || imagesOnlyHint ? ".jpg,.jpeg,.png" : ACCEPT_ATTRIBUTE}
            capture={capture && isImageType ? "environment" : undefined}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="h-auto py-1.5"
          />
          <p className="text-muted-foreground text-footnote">
            {isImageType ? "JPG или PNG" : "PDF, JPG, PNG, DOC, DOCX, XLS, XLSX"} · до 15 МБ
            {file && ` · выбран: ${file.name} (${formatFileSize(file.size)})`}
          </p>
        </div>
      </div>
      {!compact && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-note`}>Комментарий (необязательно)</Label>
          <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      )}
      <Button type="button" onClick={upload} disabled={!file} loading={pending} loadingText="Загружаем...">
        <Upload /> {replacesId ? "Загрузить новую версию" : submitLabel}
      </Button>
    </div>
  );
}
