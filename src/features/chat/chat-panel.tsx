"use client";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api, errorMessage, newIdempotencyKey } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  message: string;
  createdAt: string;
  mine: boolean;
  sender: { id: string; name: string; company: string | null };
  attachment: { id: string; filename: string; mimeType: string; size: number; type: string } | null;
};

/**
 * Чат перевозки: сообщения привязаны к orderId. Подгрузка истории порциями,
 * новые сообщения — периодический опрос. Поддерживаются текст и файл/фото.
 */
export function ChatPanel({ orderId, canSend, className }: { orderId: string; canSend: boolean; className?: string }) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [sending, setSending] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const lastAt = React.useRef<string | null>(null);

  const scrollDown = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  const merge = React.useCallback((incoming: Msg[], position: "append" | "prepend") => {
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !ids.has(m.id));
      const next = position === "append" ? [...prev, ...fresh] : [...fresh, ...prev];
      if (next.length) lastAt.current = next[next.length - 1].createdAt;
      return next;
    });
  }, []);

  React.useEffect(() => {
    let alive = true;
    api<{ items: Msg[]; hasMore: boolean }>(`/api/orders/${orderId}/messages?limit=30`)
      .then((r) => {
        if (!alive) return;
        merge(r.items, "append");
        setHasMore(r.hasMore);
        setLoading(false);
        scrollDown();
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const after = lastAt.current ? `&after=${encodeURIComponent(lastAt.current)}` : "";
        const r = await api<{ items: Msg[] }>(`/api/orders/${orderId}/messages?limit=50${after}`);
        if (r.items.length) {
          merge(r.items, "append");
          scrollDown();
        }
      } catch {
        /* опрос повторится */
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [orderId, merge]);

  const loadEarlier = async () => {
    const first = messages[0];
    if (!first) return;
    try {
      const r = await api<{ items: Msg[]; hasMore: boolean }>(
        `/api/orders/${orderId}/messages?limit=30&before=${encodeURIComponent(first.createdAt)}`,
      );
      merge(r.items, "prepend");
      setHasMore(r.hasMore);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const send = async () => {
    if (sending || (!text.trim() && !file)) return;
    setSending(true);
    try {
      let attachmentId: string | null = null;
      if (file) {
        const fd = new FormData();
        // Тип документа из чата не угадываем (скриншот счёта — не «фото груза»)
        fd.set("type", "OTHER");
        fd.set("file", file);
        fd.set("note", "Вложение из чата");
        const doc = await api<{ id: string }>(`/api/orders/${orderId}/documents`, { method: "POST", formData: fd });
        attachmentId = doc.id;
      }
      try {
        await api(`/api/orders/${orderId}/messages`, { body: { message: text, attachmentId }, idempotencyKey: newIdempotencyKey() });
      } catch (e) {
        // Сообщение не отправлено — не оставляем «осиротевший» файл в документах рейса
        if (attachmentId) await api(`/api/documents/${attachmentId}`, { method: "DELETE" }).catch(() => undefined);
        throw e;
      }
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      const after = lastAt.current ? `&after=${encodeURIComponent(lastAt.current)}` : "";
      const r = await api<{ items: Msg[] }>(`/api/orders/${orderId}/messages?limit=50${after}`);
      merge(r.items, "append");
      scrollDown();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={cn("border-border bg-card flex h-[560px] max-h-[75dvh] flex-col rounded-xl border", className)}
      data-testid="chat-panel"
    >
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite" aria-label="Сообщения чата">
        {hasMore && (
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={loadEarlier}>
              Загрузить более ранние сообщения
            </Button>
          </div>
        )}
        {loading && (
          <p className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем сообщения...
          </p>
        )}
        {error && <p className="text-destructive py-8 text-center text-sm">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">Сообщений пока нет. Напишите первым!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                m.mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
              )}
            >
              {!m.mine && (
                <p className="mb-0.5 text-xs font-medium">
                  {m.sender.name}
                  {m.sender.company && <span className="font-normal opacity-70"> · {m.sender.company}</span>}
                </p>
              )}
              {m.message && <p className="break-words whitespace-pre-wrap">{m.message}</p>}
              {m.attachment && (
                <a
                  href={`/api/documents/${m.attachment.id}/download?inline=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("mt-1 flex items-center gap-1 underline", m.mine ? "text-primary-foreground" : "text-primary")}
                >
                  <Paperclip className="size-3.5" aria-hidden /> {m.attachment.filename}
                </a>
              )}
              <p className={cn("mt-0.5 text-[11px]", m.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {formatDateTime(m.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {canSend ? (
        <form
          className="border-border border-t p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {file && (
            <p className="bg-muted mb-2 flex items-center gap-2 rounded-md px-2 py-1 text-xs">
              <Paperclip className="size-3.5" aria-hidden /> {file.name}
              <button type="button" onClick={() => setFile(null)} aria-label="Убрать вложение" className="ml-auto">
                <X className="size-3.5" />
              </button>
            </p>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              id={`chat-file-${orderId}`}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="ghost" size="icon" asChild>
              <label htmlFor={`chat-file-${orderId}`} aria-label="Прикрепить файл или фото" className="cursor-pointer">
                <Paperclip />
              </label>
            </Button>
            <Textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Написать сообщение…"
              className="min-h-9 resize-none"
              aria-label="Текст сообщения"
              maxLength={4000}
            />
            <Button type="submit" size="icon" loading={sending} disabled={!text.trim() && !file} aria-label="Отправить сообщение">
              <Send />
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-border text-muted-foreground border-t p-3 text-center text-xs">Чат доступен только для чтения</p>
      )}
    </div>
  );
}
