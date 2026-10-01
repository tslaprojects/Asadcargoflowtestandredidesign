"use client";
import { Check, Paperclip } from "lucide-react";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import type { OrderStatus } from "@/generated/prisma/enums";
import { orderProgress, type StepState } from "@/lib/state-machine/order-progress";
import { ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";
import { cn } from "@/lib/utils";

export type HistoryEntry = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId: string | null;
  actorType: string;
  source: string;
  comment: string | null;
  documentIds: string[];
  createdAt: Date | string;
};

type Step = { key: string; label: string; state: StepState; entries: HistoryEntry[] };

function buildSteps(history: HistoryEntry[], current: string, createdAt: Date | string): { steps: Step[]; note: string | null } {
  const progress = orderProgress(history, current as OrderStatus);
  const steps = progress.steps.map((s) => ({
    key: s.key,
    label: s.label,
    state: s.state,
    entries:
      s.key === "created"
        ? [
            {
              id: "created",
              fromStatus: null,
              toStatus: "CARRIER_SELECTED",
              actorUserId: null,
              actorType: "SYSTEM",
              source: "SYSTEM",
              comment: "Заявка создана",
              documentIds: [],
              createdAt,
            },
          ]
        : history.filter((h) => (s.statuses as readonly string[]).includes(h.toStatus)),
  }));
  return { steps, note: progress.currentNote };
}

/** Основной timeline перевозки. Клик по этапу — подробности события из истории статусов. */
export function OrderStatusTimeline({
  history,
  current,
  createdAt,
  userNames,
  documents,
}: {
  history: HistoryEntry[];
  current: string;
  createdAt: Date | string;
  userNames: Record<string, string>;
  documents?: Record<string, string>;
}) {
  const { steps, note } = buildSteps(history, current, createdAt);
  const [selected, setSelected] = React.useState<Step | null>(null);
  return (
    <>
      <ol className="relative" aria-label="Этапы перевозки">
        {steps.map((s, i) => {
          const next = steps[i + 1];
          return (
            <li key={s.key} className="relative">
              {next && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-8 bottom-0 left-[1.3125rem] w-0.5 -translate-x-1/2 rounded-full transition-colors duration-(--duration-complex)",
                    s.state === "done" && next.state !== "todo" ? "bg-success" : "bg-border",
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => s.entries.length && setSelected(s)}
                disabled={!s.entries.length}
                className={cn(
                  "group relative flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150",
                  s.entries.length > 0 && "hover:bg-surface-secondary",
                  s.state === "current" && "bg-accent/60",
                )}
                aria-current={s.state === "current" ? "step" : undefined}
                aria-label={`${s.label}: ${s.state === "done" ? "выполнено" : s.state === "current" ? "текущий этап" : "не начато"}`}
              >
                <span
                  className={cn(
                    "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[0.6875rem] font-semibold transition-colors duration-(--duration-complex)",
                    s.state === "done" && "border-success bg-success text-white",
                    s.state === "current" && "border-primary bg-card text-primary",
                    s.state === "todo" && "border-border bg-card text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {s.state === "done" ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : s.state === "current" ? (
                    <span className="bg-primary animate-live-pulse text-primary size-2.5 rounded-full" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1 py-0.5">
                  <span
                    className={cn(
                      "block text-sm",
                      s.state === "todo" && "text-muted-foreground",
                      s.state === "done" && "font-medium",
                      s.state === "current" && "text-primary font-semibold",
                    )}
                  >
                    {s.label}
                    {s.state === "current" && note && <span className="text-muted-foreground font-normal"> · {note}</span>}
                  </span>
                </span>
                {s.entries.length > 0 && (
                  <span className="text-muted-foreground group-hover:text-foreground num shrink-0 py-0.5 text-xs">
                    {formatDateTime(s.entries[s.entries.length - 1].createdAt)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {(current === "DISPUTED" || current === "ON_HOLD" || current === "CANCELLED") && (
        <p className="bg-danger-bg text-danger border-danger-border mt-3 rounded-lg border px-3 py-2 text-sm">
          Текущий статус: {ORDER_STATUS_LABELS[current as keyof typeof ORDER_STATUS_LABELS]}
        </p>
      )}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.label}</DialogTitle>
            <DialogDescription>События этапа</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {selected?.entries.map((e) => (
              <li key={e.id} className="border-border rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {e.fromStatus ? `${ORDER_STATUS_LABELS[e.fromStatus as keyof typeof ORDER_STATUS_LABELS]} → ` : ""}
                  {ORDER_STATUS_LABELS[e.toStatus as keyof typeof ORDER_STATUS_LABELS]}
                </p>
                <dl className="text-muted-foreground mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-y-1">
                  <dt>Дата и время</dt>
                  <dd className="text-foreground">{formatDateTime(e.createdAt)}</dd>
                  <dt>Пользователь</dt>
                  <dd className="text-foreground">{e.actorUserId ? (userNames[e.actorUserId] ?? "—") : "Система"}</dd>
                  <dt>Источник</dt>
                  <dd className="text-foreground">{label("ActionSource", e.source)}</dd>
                  {e.comment && (
                    <>
                      <dt>Комментарий</dt>
                      <dd className="text-foreground">{e.comment}</dd>
                    </>
                  )}
                  {e.documentIds.length > 0 && (
                    <>
                      <dt>Вложения</dt>
                      <dd className="space-y-0.5">
                        {e.documentIds.map((d) => (
                          <a
                            key={d}
                            href={`/api/documents/${d}/download?inline=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary flex items-center gap-1 hover:underline"
                          >
                            <Paperclip className="size-3.5" aria-hidden /> {documents?.[d] ?? "Документ"}
                          </a>
                        ))}
                      </dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
