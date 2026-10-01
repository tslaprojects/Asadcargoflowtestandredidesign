import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Ширина контейнера таблицы, ниже которой колонка скрывается (container queries — работает и в узкой колонке dashboard). */
export type HideBelow = "@2xl" | "@3xl" | "@4xl" | "@5xl";
const HIDE_BELOW: Record<HideBelow, string> = {
  "@2xl": "hidden @2xl:table-cell",
  "@3xl": "hidden @3xl:table-cell",
  "@4xl": "hidden @4xl:table-cell",
  "@5xl": "hidden @5xl:table-cell",
};

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Скрыть колонку в мобильной карточке. */
  hideOnMobile?: boolean;
  /** Главная строка мобильной карточки. */
  primary?: boolean;
  /** Мобильная карточка: «badge» — справа в заголовке (статус), «full» — на всю ширину без подписи (маршрут). */
  mobile?: "badge" | "full";
  /** Второстепенная колонка: скрывается, когда таблице не хватает ширины. */
  hideBelow?: HideBelow;
};

/**
 * Переиспользуемая таблица: на desktop — компактная таблица с приоритетом колонок, на mobile — карточки.
 * Пагинация, поиск и фильтры управляются через URL (серверная выборка).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: React.ReactNode;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const badge = columns.find((c) => c.mobile === "badge");
  const rest = columns.filter((c) => c !== primary && c !== badge && !c.hideOnMobile);
  return (
    <>
      <div className="border-border bg-card @container hidden overflow-hidden rounded-lg border shadow-xs md:block">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn(rowHref && "group relative")}>
                {columns.map((c, i) => (
                  <TableCell key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.className)}>
                    {i === 0 && rowHref ? (
                      <Link
                        href={rowHref(row)}
                        className="text-primary id-code focus-visible:after:outline-ring font-medium group-hover:underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2"
                      >
                        {c.cell(row)}
                      </Link>
                    ) : (
                      <span className="relative z-[1]">{c.cell(row)}</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => {
          const content = (
            <div
              className={cn(
                "border-border bg-card rounded-lg border p-3.5 shadow-xs",
                rowHref && "active:bg-surface-secondary transition-colors duration-100",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={cn("min-w-0 font-medium", rowHref && "text-primary id-code")}>{primary.cell(row)}</div>
                <div className="flex shrink-0 items-center gap-1">
                  {badge?.cell(row)}
                  {rowHref && <ChevronRight className="text-muted-foreground size-4" aria-hidden />}
                </div>
              </div>
              {rest.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {rest.map((c) =>
                    c.mobile === "full" ? (
                      <div key={c.key} className="col-span-2 min-w-0">
                        <dt className="sr-only">{c.header}</dt>
                        <dd>{c.cell(row)}</dd>
                      </div>
                    ) : (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-muted-foreground text-xs">{c.header}</dt>
                        <dd className="truncate">{c.cell(row)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              )}
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {rowHref ? (
                <Link href={rowHref(row)} className="block rounded-lg">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
