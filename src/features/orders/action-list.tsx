import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { InsetGroup } from "@/components/common/inset-group";
import type { ActionItem } from "@/server/services/dashboard.service";
import { cn } from "@/lib/utils";

const TONE = {
  danger: { icon: AlertTriangle, color: "text-danger" },
  warning: { icon: AlertCircle, color: "text-warning" },
  info: { icon: Info, color: "text-info" },
} as const;

/**
 * «Требуют вашего действия» — что сделать сейчас и где.
 * Сначала критичное (спор), затем требующее действия, затем информационное.
 */
export function ActionList({
  items,
  title = "Требуют вашего действия",
  bare,
}: {
  items: ActionItem[];
  title?: string;
  /** Без блока-группы — внутри колонки списка. */
  bare?: boolean;
}) {
  const order = { danger: 0, warning: 1, info: 2 } as const;
  const sorted = [...items].sort((a, b) => order[a.tone] - order[b.tone]);
  const list =
    items.length === 0 ? (
      <p className="text-subheadline text-muted-foreground flex items-center gap-2 px-4 py-3">
        <CheckCircle2 className="text-success size-4" aria-hidden /> Всё под контролем — действий не требуется
      </p>
    ) : (
      <ul className="[&>li+li_[data-row-content]]:hairline-t">
        {sorted.map((a, i) => {
          const t = TONE[a.tone];
          const Icon = t.icon;
          return (
            <li key={a.key} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
              <Link
                href={a.href}
                className="hover:bg-fill-quaternary active:bg-fill-tertiary flex items-stretch gap-3 rounded-md pl-3 transition-colors duration-(--duration-micro)"
              >
                <Icon className={cn("mt-3 size-[1.125rem] shrink-0", t.color)} aria-hidden />
                <span data-row-content className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.title}</span>
                    <span className="text-footnote text-muted-foreground block">{a.description}</span>
                  </span>
                  <ChevronRight className="text-tertiary-foreground size-4 shrink-0" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  if (bare) {
    return (
      <div data-testid="action-list" className="px-2 pb-2">
        {list}
      </div>
    );
  }
  return (
    <InsetGroup
      header={
        <span className="inline-flex items-center gap-1.5">
          {title}
          {items.length > 0 && <span className="text-warning num">{items.length}</span>}
        </span>
      }
    >
      <div data-testid="action-list" className="p-1">
        {list}
      </div>
    </InsetGroup>
  );
}
