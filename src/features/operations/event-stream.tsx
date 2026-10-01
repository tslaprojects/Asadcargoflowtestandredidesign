import Link from "next/link";
import { statusTone } from "@/components/common/status-badge";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OperationalEvent } from "@/server/services/operations.service";

const TONE_DOT: Record<string, string> = {
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
  neutral: "bg-neutral",
  delayed: "bg-delayed",
  outline: "bg-neutral",
};

/** Поток событий: смены статусов перевозок по времени, каждое — ссылка на объект. */
export function EventStream({ events, now, className }: { events: OperationalEvent[]; now: string; className?: string }) {
  if (events.length === 0) return <p className="text-muted-foreground px-4 py-3 text-sm">Событий пока нет.</p>;
  const ref = new Date(now);
  return (
    <ol className={cn("px-2", className)} data-testid="event-stream">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`/orders/${e.orderId}`}
            className="hover:bg-surface-secondary flex gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150"
          >
            <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE_DOT[statusTone("OrderStatus", e.status)])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-5">
                <span className="id-code font-medium">{e.publicNumber}</span> <span className="text-muted-foreground">·</span> {e.title}
              </span>
              {e.comment && <span className="text-muted-foreground block truncate text-xs">{e.comment}</span>}
            </span>
            <time dateTime={e.at} className="text-meta shrink-0 pt-0.5">
              {formatRelative(e.at, ref)}
            </time>
          </Link>
        </li>
      ))}
    </ol>
  );
}
