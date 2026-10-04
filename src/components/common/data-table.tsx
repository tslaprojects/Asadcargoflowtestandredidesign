import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Ширина контейнера таблицы, ниже которой колонка скрывается (container queries — работает и в узкой колонке). */
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
  /** Скрыть колонку в мобильном списке. */
  hideOnMobile?: boolean;
  /** Главная строка в мобильном списке. */
  primary?: boolean;
  /** Мобильный список: «badge» — справа от заголовка (статус), «full» — отдельной строкой без подписи (маршрут). */
  mobile?: "badge" | "full";
  /** Второстепенная колонка: скрывается, когда таблице не хватает ширины. */
  hideBelow?: HideBelow;
};

/**
 * Таблица в духе Finder на широком экране, сгруппированный список iOS на телефоне.
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
  const full = rest.filter((c) => c.mobile === "full");
  const pairs = rest.filter((c) => c.mobile !== "full");
  return (
    <>
      <div className="bg-card @container hidden overflow-hidden rounded-lg md:block">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <TableRow className="hover:!bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn(rowHref && "relative")}>
                {columns.map((c, i) => (
                  <TableCell key={c.key} className={cn(c.hideBelow && HIDE_BELOW[c.hideBelow], c.className)}>
                    {i === 0 && rowHref ? (
                      <Link
                        href={rowHref(row)}
                        className="id-code font-medium outline-none after:absolute after:inset-0 focus-visible:after:rounded-xs focus-visible:after:outline-3 focus-visible:after:-outline-offset-3 focus-visible:after:outline-[var(--ring)]"
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
      <ul className="bg-card [&>li+li_[data-row-content]]:hairline-t overflow-hidden rounded-lg md:hidden">
        {rows.map((row) => {
          const content = (
            <div
              className={cn(
                "pl-4",
                rowHref && "hover:bg-fill-quaternary active:bg-fill-tertiary transition-colors duration-(--duration-micro)",
              )}
            >
              <div data-row-content className="py-3 pr-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="id-code min-w-0 font-medium">{primary.cell(row)}</div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {badge?.cell(row)}
                    {rowHref && <ChevronRight className="text-tertiary-foreground size-4" aria-hidden />}
                  </div>
                </div>
                {full.map((c) => (
                  <div key={c.key} className="mt-1 min-w-0">
                    <span className="sr-only">{c.header}: </span>
                    {c.cell(row)}
                  </div>
                ))}
                {pairs.length > 0 && (
                  <dl className="text-subheadline mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {pairs.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-footnote text-muted-foreground">{c.header}</dt>
                        <dd className="truncate">{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {rowHref ? (
                <Link href={rowHref(row)} className="block">
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
