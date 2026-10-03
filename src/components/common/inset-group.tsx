import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Сгруппированный список iOS Settings: заголовок над блоком, белый блок со скруглением,
 * строки разделены линиями с отступом слева, пояснение под блоком.
 */
export function InsetGroup({
  header,
  footer,
  action,
  className,
  children,
  as: Tag = "section",
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  as?: "section" | "div";
}) {
  return (
    <Tag className={cn("min-w-0", className)}>
      {(header || action) && (
        <div className="mb-1.5 flex min-h-6 items-end justify-between gap-3 px-4">
          {header && <h2 className="text-section">{header}</h2>}
          {action && <div className="text-footnote shrink-0">{action}</div>}
        </div>
      )}
      <div className="bg-card overflow-hidden rounded-lg">{children}</div>
      {footer && <div className="text-footnote text-muted-foreground mt-1.5 px-4">{footer}</div>}
    </Tag>
  );
}

/** Список строк внутри InsetGroup: каждая следующая строка отделена волосяной линией от начала текста. */
export function InsetList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("[&>li+li_[data-row-content]]:hairline-t", className)}>{children}</ul>;
}

/** Строка списка: значок слева, заголовок и подзаголовок, значение справа, шеврон для перехода. */
export function ListRow({
  title,
  subtitle,
  value,
  leading,
  href,
  onClick,
  className,
  testId,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  leading?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  testId?: string;
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {leading && <span className="text-muted-foreground flex shrink-0 items-center">{leading}</span>}
      <span data-row-content className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 lg:py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {subtitle && <span className="text-subheadline text-muted-foreground mt-0.5 block truncate">{subtitle}</span>}
        </span>
        {value !== undefined && <span className="text-muted-foreground shrink-0 text-right">{value}</span>}
        {interactive && <ChevronRight className="text-tertiary-foreground size-4 shrink-0" aria-hidden />}
      </span>
    </>
  );
  const cls = cn(
    "flex min-h-11 items-stretch gap-3 pl-4 text-left lg:min-h-9",
    interactive && "hover:bg-fill-quaternary active:bg-fill-tertiary w-full transition-colors duration-(--duration-micro)",
    className,
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cls} data-testid={testId}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cls} data-testid={testId}>
          {body}
        </button>
      ) : (
        <div className={cls} data-testid={testId}>
          {body}
        </div>
      )}
    </li>
  );
}
