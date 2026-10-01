"use client";
import { Download, Eye, FileText, History, Image as ImageIcon, Trash2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { label } from "@/lib/i18n";
import { DocumentUploader } from "./document-uploader";

export type DocItem = {
  id: string;
  type: string;
  filename: string;
  mimeType: string;
  size: number;
  version: number;
  status: string;
  createdAt: Date | string;
  note?: string | null;
  uploadedByName?: string;
  canDelete?: boolean;
  canReplace?: boolean;
};

export function DocumentList({
  docs,
  downloadBase = "/api/documents",
  deleteBase = "/api/documents",
  replaceUrl,
  replaceTypes,
}: {
  docs: DocItem[];
  downloadBase?: string;
  deleteBase?: string;
  replaceUrl?: string;
  replaceTypes?: string[];
}) {
  const { run } = useAction();
  const [replacing, setReplacing] = React.useState<DocItem | null>(null);
  const href = (d: DocItem, inline = false) =>
    downloadBase === "/api/documents"
      ? `/api/documents/${d.id}/download${inline ? "?inline=1" : ""}`
      : `${downloadBase}/${d.id}/download${inline ? "?inline=1" : ""}`;

  if (docs.length === 0) return <p className="text-muted-foreground py-6 text-center text-sm">Документов пока нет</p>;
  return (
    <>
      <ul className="divide-border border-border bg-card divide-y rounded-lg border" data-testid="document-list">
        {docs.map((d) => {
          const isImage = d.mimeType.startsWith("image/");
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
              <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                {isImage ? <ImageIcon className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.filename}</p>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                  <span>{label("DocumentType", d.type)}</span>
                  <span>· {formatFileSize(d.size)}</span>
                  <span>· {formatDateTime(d.createdAt)}</span>
                  {d.uploadedByName && <span>· {d.uploadedByName}</span>}
                  {d.version > 1 && <Badge tone="info">версия {d.version}</Badge>}
                  {d.status === "SUPERSEDED" && <Badge tone="neutral">предыдущая версия</Badge>}
                </p>
                {d.note && <p className="text-muted-foreground text-xs">«{d.note}»</p>}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content="Открыть">
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={href(d, true)} target="_blank" rel="noopener noreferrer" aria-label={`Открыть ${d.filename}`}>
                      <Eye />
                    </a>
                  </Button>
                </Tooltip>
                <Tooltip content="Скачать документ">
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={href(d)} aria-label={`Скачать ${d.filename}`}>
                      <Download />
                    </a>
                  </Button>
                </Tooltip>
                {d.canReplace && replaceUrl && d.status === "ACTIVE" && (
                  <Tooltip content="Новая версия">
                    <Button variant="ghost" size="icon-sm" onClick={() => setReplacing(d)} aria-label={`Новая версия ${d.filename}`}>
                      <History />
                    </Button>
                  </Tooltip>
                )}
                {d.canDelete && (
                  <ConfirmDialog
                    title="Удалить документ?"
                    description={`«${d.filename}» будет удалён из перевозки.`}
                    consequences={
                      d.version > 1
                        ? ["Актуальной станет предыдущая версия документа.", "Запись об удалении сохранится в журнале аудита."]
                        : ["Запись об удалении сохранится в журнале аудита."]
                    }
                    irreversible
                    destructive
                    confirmLabel="Удалить"
                    pendingLabel="Удаляем..."
                    onConfirm={async () => {
                      const r = await run(() => api(`${deleteBase}/${d.id}`, { method: "DELETE" }), { success: "Документ удалён" });
                      return r !== undefined;
                    }}
                    trigger={
                      <Tooltip content="Удалить">
                        <Button variant="ghost" size="icon-sm" aria-label={`Удалить ${d.filename}`}>
                          <Trash2 className="text-destructive" />
                        </Button>
                      </Tooltip>
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!replacing} onOpenChange={(o) => !o && setReplacing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая версия: {replacing?.filename}</DialogTitle>
          </DialogHeader>
          {replacing && replaceUrl && (
            <DocumentUploader
              url={replaceUrl}
              types={replaceTypes?.includes(replacing.type) ? [replacing.type] : [replacing.type]}
              replacesId={replacing.id}
              onUploaded={() => setReplacing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
