import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionItem } from "@/server/services/dashboard.service";
import { cn } from "@/lib/utils";

const TONE = {
  danger: { icon: AlertTriangle, tile: "bg-danger-bg text-danger" },
  warning: { icon: AlertCircle, tile: "bg-warning-bg text-warning" },
  info: { icon: Info, tile: "bg-info-bg text-info" },
} as const;

/**
 * «Требуют вашего действия» — главный рабочий список: что сделать сейчас и где.
 * Сначала критичное (спор), затем требующее действия, затем информационное.
 */
export function ActionList({ items, title = "Требуют вашего действия" }: { items: ActionItem[]; title?: string }) {
  const order = { danger: 0, warning: 1, info: 2 } as const;
  const sorted = [...items].sort((a, b) => order[a.tone] - order[b.tone]);
  return (
    <Card data-testid="action-list">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          {title}
          {items.length > 0 && (
            <span className="bg-warning-bg text-warning border-warning-border num grid h-5 min-w-5 place-items-center rounded-full border px-1.5 text-xs font-semibold">
              {items.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 px-3 pb-3 text-sm">
            <CheckCircle2 className="text-success size-4" aria-hidden /> Всё под контролем — действий не требуется
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map((a, i) => {
              const t = TONE[a.tone];
              const Icon = t.icon;
              return (
                <li key={a.key} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                  <Link
                    href={a.href}
                    className="group hover:bg-surface-secondary flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150"
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", t.tile)} aria-hidden>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="group-hover:text-primary block text-sm leading-5 font-medium transition-colors duration-150">
                        {a.title}
                      </span>
                      <span className="text-muted-foreground block text-xs leading-4">{a.description}</span>
                    </span>
                    <ChevronRight
                      className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
