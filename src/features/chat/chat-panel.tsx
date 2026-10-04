"use client";
import { ArrowUp, Loader2, Paperclip, Plus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api, errorMessage, newIdempotencyKey } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
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
    <div className={cn("bg-card flex h-[560px] max-h-[75dvh] flex-col rounded-lg", className)} data-testid="chat-panel">
      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-live="polite" aria-label="Сообщения чата">
        {hasMore && (
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={loadEarlier}>
              Загрузить более ранние сообщения
            </Button>
          </div>
        )}
        {loading && (
          <p className="text-muted-foreground text-body flex items-center justify-center gap-2 py-8">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем сообщения...
          </p>
        )}
        {error && <p className="text-danger text-body py-8 text-center">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="text-muted-foreground text-body py-8 text-center">Сообщений пока нет. Напишите первым!</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.mine === m.mine && prev.sender.name === m.sender.name;
          return (
            <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start", grouped ? "mt-0.5" : "mt-3 first:mt-0")}>
              {!m.mine && !grouped && (
                <p className="text-footnote text-muted-foreground mb-1 px-3">
                  {m.sender.name}
                  {m.sender.company && <span> · {m.sender.company}</span>}
                </p>
              )}
              <div
                className={cn(
                  "max-w-[78%] rounded-[1.125rem] px-3.5 py-2",
                  m.mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-fill-tertiary text-foreground rounded-bl-md",
                )}
              >
                {m.message && <p className="break-words whitespace-pre-wrap">{m.message}</p>}
                {m.attachment && (
                  <a
                    href={`/api/documents/${m.attachment.id}/download?inline=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex items-center gap-1 underline underline-offset-2",
                      m.message && "mt-1",
                      m.mine ? "text-primary-foreground" : "text-link",
                    )}
                  >
                    <Paperclip className="size-3.5" aria-hidden /> {m.attachment.filename}
                  </a>
                )}
              </div>
              <p className="text-caption text-tertiary-foreground num mt-0.5 px-3">{formatDateTime(m.createdAt)}</p>
            </div>
          );
        })}
      </div>
      {canSend ? (
        <form
          className="hairline-t px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {file && (
            <p className="bg-fill-quaternary text-footnote mb-2 flex items-center gap-2 rounded-md px-2.5 py-1.5">
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
            <label
              htmlFor={`chat-file-${orderId}`}
              aria-label="Прикрепить файл или фото"
              className="bg-fill-tertiary text-muted-foreground hover:bg-fill-secondary grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-(--duration-micro)"
            >
              <Plus className="size-5" aria-hidden />
            </label>
            <div className="relative flex min-w-0 flex-1 items-end">
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
                placeholder={t("ui.messagePlaceholder")}
                className="border-border-strong min-h-9 resize-none rounded-[1.125rem] py-2 pr-11 pl-3.5 lg:min-h-9 lg:py-2"
                aria-label="Текст сообщения"
                maxLength={4000}
              />
              <Button
                type="submit"
                size="icon-sm"
                loading={sending}
                disabled={!text.trim() && !file}
                aria-label="Отправить сообщение"
                className="absolute right-1 bottom-1 size-7 rounded-full p-0 lg:size-7 [&_svg]:size-4"
              >
                <ArrowUp className="[stroke-width:2.5]" />
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground hairline-t text-footnote p-3 text-center">Чат доступен только для чтения</p>
      )}
    </div>
  );
}
