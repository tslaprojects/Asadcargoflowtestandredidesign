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
  if (events.length === 0) return <p className="text-subheadline text-muted-foreground px-4 py-6 text-center">Событий пока нет.</p>;
  const ref = new Date(now);
  return (
    <ol className={cn("[&>li+li_[data-row-content]]:hairline-t px-2", className)} data-testid="event-stream">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`/orders/${e.orderId}`}
            className="hover:bg-fill-quaternary flex gap-2.5 rounded-md px-2.5 transition-colors duration-(--duration-micro)"
          >
            <span
              aria-hidden
              className={cn("mt-[0.8125rem] size-2 shrink-0 rounded-full", TONE_DOT[statusTone("OrderStatus", e.status)])}
            />
            <span data-row-content className="flex min-w-0 flex-1 gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.title}</span>
                <span className="text-footnote text-muted-foreground block truncate">
                  <span className="id-code">{e.publicNumber}</span>
                  {e.comment && <> · {e.comment}</>}
                </span>
              </span>
              <time dateTime={e.at} className="text-footnote text-muted-foreground num shrink-0 pt-px">
                {formatRelative(e.at, ref)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
