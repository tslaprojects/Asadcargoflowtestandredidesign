import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Серверная пагинация через query-параметр page (сохраняет остальные фильтры). */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  searchParams = {},
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "page" || v === undefined || v === "") continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.set(k, v);
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const cls = "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-sm";
  return (
    <nav aria-label="Пагинация" className="mt-4 flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
      <p className="text-muted-foreground">
        {from}–{to} из {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link className={cn(cls, "hover:bg-muted")} href={href(page - 1)} aria-label="Предыдущая страница">
            <ChevronLeft className="size-4" /> Назад
          </Link>
        ) : (
          <span className={cn(cls, "opacity-50")} aria-disabled>
            <ChevronLeft className="size-4" /> Назад
          </span>
        )}
        <span className="tabular text-muted-foreground px-1">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link className={cn(cls, "hover:bg-muted")} href={href(page + 1)} aria-label="Следующая страница">
            Вперёд <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={cn(cls, "opacity-50")} aria-disabled>
            Вперёд <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
