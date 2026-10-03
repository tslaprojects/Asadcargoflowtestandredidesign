import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { t } from "@/lib/i18n";
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
  const seg =
    "text-body inline-flex h-11 items-center gap-1 px-3 lg:h-7 lg:px-2.5 transition-colors duration-(--duration-micro) [&_svg]:size-4 lg:[&_svg]:size-3.5";
  return (
    <nav aria-label="Пагинация" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-footnote text-muted-foreground num">
        {from}–{to} {t("common.of")} {total}
      </p>
      <div className="bg-fill-tertiary flex items-center rounded-md p-0.5">
        {page > 1 ? (
          <Link className={cn(seg, "hover:bg-fill-tertiary rounded-[0.4375rem]")} href={href(page - 1)} aria-label="Предыдущая страница">
            <ChevronLeft aria-hidden /> <span className="max-sm:sr-only">{t("common.prev")}</span>
          </Link>
        ) : (
          <span className={cn(seg, "opacity-35")} aria-disabled>
            <ChevronLeft aria-hidden /> <span className="max-sm:sr-only">{t("common.prev")}</span>
          </span>
        )}
        <span className="text-footnote text-muted-foreground num px-2">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link className={cn(seg, "hover:bg-fill-tertiary rounded-[0.4375rem]")} href={href(page + 1)} aria-label="Следующая страница">
            <span className="max-sm:sr-only">{t("common.next")}</span> <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className={cn(seg, "opacity-35")} aria-disabled>
            <span className="max-sm:sr-only">{t("common.next")}</span> <ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
