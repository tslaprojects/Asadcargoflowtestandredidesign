"use client";
import { Check, Paperclip } from "lucide-react";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { ORDER_STATUS_LABELS, TIMELINE_STEPS } from "@/lib/state-machine/order-state-machine";
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

type Step = { key: string; label: string; state: "done" | "current" | "todo"; entries: HistoryEntry[] };

function buildSteps(history: HistoryEntry[], current: string, createdAt: Date | string): Step[] {
  const reached = (statuses: readonly string[]) => history.filter((h) => statuses.includes(h.toStatus));
  const effective =
    current === "DISPUTED" || current === "ON_HOLD"
      ? ([...history].reverse().find((h) => h.toStatus !== "DISPUTED" && h.toStatus !== "ON_HOLD")?.toStatus ?? current)
      : current;
  const currentIdx = TIMELINE_STEPS.findIndex((s) => (s.statuses as string[]).includes(effective));
  return TIMELINE_STEPS.map((s, i) => {
    const entries =
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
        : reached(s.statuses);
    let state: Step["state"] = entries.length > 0 ? "done" : "todo";
    if (s.key === "created") state = "done";
    if (i === currentIdx && current !== "CLOSED") state = "current";
    if (current === "CLOSED" && s.key === "closed") state = "done";
    return { key: s.key, label: s.label, state, entries };
  });
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
  const steps = buildSteps(history, current, createdAt);
  const [selected, setSelected] = React.useState<Step | null>(null);
  return (
    <>
      <ol className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-1" aria-label="Этапы перевозки">
        {steps.map((s, i) => (
          <li key={s.key} className="relative">
            <button
              type="button"
              onClick={() => s.entries.length && setSelected(s)}
              disabled={!s.entries.length}
              className={cn("group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left", s.entries.length && "hover:bg-muted")}
              aria-label={`${s.label}: ${s.state === "done" ? "выполнено" : s.state === "current" ? "текущий этап" : "не начато"}`}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs",
                  s.state === "done" && "border-success bg-success text-white",
                  s.state === "current" && "border-primary bg-primary ring-primary/15 text-white ring-4",
                  s.state === "todo" && "border-border bg-card text-muted-foreground",
                )}
                aria-hidden
              >
                {s.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : s.state === "current" ? "●" : i + 1}
              </span>
              <span className={cn("flex-1 text-sm", s.state === "todo" ? "text-muted-foreground" : "font-medium")}>{s.label}</span>
              {s.entries.length > 0 && (
                <span className="text-muted-foreground group-hover:text-foreground text-xs">
                  {formatDateTime(s.entries[s.entries.length - 1].createdAt)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      {(current === "DISPUTED" || current === "ON_HOLD" || current === "CANCELLED") && (
        <p className="bg-danger-bg text-danger mt-2 rounded-md px-3 py-2 text-sm">
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
