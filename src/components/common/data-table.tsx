import Link from "next/link";
import type * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Скрыть колонку в мобильной карточке. */
  hideOnMobile?: boolean;
  /** Главная строка мобильной карточки. */
  primary?: boolean;
};

/**
 * Переиспользуемая таблица: на desktop — компактная таблица, на mobile — карточки.
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
  return (
    <>
      <div className="border-border bg-card hidden overflow-hidden rounded-xl border shadow-xs md:block">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn(rowHref && "relative")}>
                {columns.map((c, i) => (
                  <TableCell key={c.key} className={c.className}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(row)} className="text-primary font-medium after:absolute after:inset-0 hover:underline">
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
            <div className="border-border bg-card rounded-xl border p-3 shadow-xs">
              <div className="mb-2 font-medium">{primary.cell(row)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {columns
                  .filter((c) => c !== primary && !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{c.header}</dt>
                      <dd className="truncate">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {rowHref ? (
                <Link href={rowHref(row)} className="block active:opacity-80">
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
