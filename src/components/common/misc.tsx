import { AlertCircle, ArrowLeft, ChevronRight, Inbox, Loader2, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { countryFlag, countryName } from "@/lib/geo/countries";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:mb-6">
      {back && (
        <Link
          href={back.href}
          className="text-muted-foreground hover:text-foreground -ml-1 inline-flex min-h-8 w-fit items-center gap-1 rounded-md px-1 text-sm transition-colors duration-150"
        >
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1">{title}</h1>
          {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: { href?: string; label: string; onClick?: () => void };
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border-strong bg-card animate-fade-in flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center sm:py-12",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground mb-3 grid size-11 place-items-center rounded-xl">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-h3">{title}</p>
      {description && <p className="text-muted-foreground mt-1 max-w-md text-sm text-pretty">{description}</p>}
      {action &&
        (action.href ? (
          <Button asChild className="mt-4">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button className="mt-4" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

export function ErrorState({
  title = "Не удалось загрузить данные",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="border-danger-border bg-danger-bg animate-fade-in flex flex-col items-center rounded-xl border px-6 py-10 text-center"
    >
      <AlertCircle className="text-danger mb-2 size-6" aria-hidden />
      <p className="text-danger text-h3">{title}</p>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      {retry && <div className="mt-4">{retry}</div>}
    </div>
  );
}

export function LoadingState({ label = "Загрузка..." }: { label?: string }) {
  return (
    <div role="status" className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border" role="status" aria-label="Загрузка">
      <div className="bg-surface-secondary border-border flex gap-6 border-b px-4 py-3">
        {[20, 28, 16, 14].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-border flex items-center gap-6 border-b px-4 py-3.5 last:border-0">
          <Skeleton className="h-4 w-[18%]" />
          <Skeleton className="h-4 w-[26%]" />
          <Skeleton className="h-5 w-[14%] rounded-full" />
          <Skeleton className="ml-auto h-4 w-[10%]" />
        </div>
      ))}
    </div>
  );
}

/** Скелетон страницы: повторяет структуру — заголовок, KPI, основная колонка и боковая панель. */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "detail" | "dashboard" }) {
  return (
    <div className="space-y-5" role="status" aria-label="Загрузка страницы">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {variant !== "detail" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-border bg-card space-y-3 rounded-xl border p-4">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      )}
      {variant === "list" ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="border-border bg-card space-y-4 rounded-xl border p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
          <div className="border-border bg-card space-y-3 rounded-xl border p-5">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MoneyDisplay({
  amount,
  currency,
  className,
  muted,
}: {
  amount: number | null | undefined;
  currency: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className={cn("num font-medium whitespace-nowrap", muted && "text-muted-foreground font-normal", className)}>
      {formatMoney(amount, currency)}
    </span>
  );
}

export function CountryLabel({ code, city, className }: { code: string | null | undefined; city?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={countryName(code)}>
      <span aria-hidden>{countryFlag(code)}</span>
      <span>{city ?? countryName(code)}</span>
    </span>
  );
}

export function VerificationBadge({ status, className }: { status: string; className?: string }) {
  if (status !== "VERIFIED") return null;
  return (
    <span
      className={cn("text-success inline-flex items-center gap-0.5 text-xs font-medium", className)}
      title="Компания прошла проверку CargoFlow"
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      <span>Проверена</span>
    </span>
  );
}

export function CompanyBadge({
  id,
  name,
  verification,
  rating,
  link = true,
}: {
  id?: string;
  name: string;
  verification?: string;
  rating?: { average: number | null; count: number } | null;
  link?: boolean;
}) {
  const inner = (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-medium">{name}</span>
      {verification && <VerificationBadge status={verification} />}
      {rating && rating.count > 0 && <RatingInline value={rating.average} count={rating.count} />}
    </span>
  );
  return link && id ? (
    <Link href={`/companies/${id}`} className="hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function RatingInline({ value, count }: { value: number | null; count: number }) {
  if (!value) return <span className="text-muted-foreground text-xs">нет отзывов</span>;
  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-0.5 text-xs"
      aria-label={`Рейтинг ${value} из 5, отзывов: ${count}`}
    >
      <Star className="fill-rating text-rating size-3.5" aria-hidden />
      <span className="text-foreground font-medium">{value.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

/**
 * KPI с бизнес-смыслом: подпись, значение (табличные цифры), пояснение.
 * Цвет — только у тона со смыслом (warning/danger — требует внимания); ссылка ведёт к списку за цифрой.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const iconTone = {
    neutral: "text-muted-foreground bg-muted",
    info: "text-info bg-info-bg",
    success: "text-success bg-success-bg",
    warning: "text-warning bg-warning-bg",
    danger: "text-danger bg-danger-bg",
  }[tone];
  const body = (
    <div
      className={cn(
        "border-border bg-card group flex h-full flex-col gap-2 rounded-xl border p-4 shadow-xs",
        href && "group-hover:border-border-strong transition-[border-color,box-shadow] duration-200 ease-out group-hover:shadow-md",
        (tone === "warning" || tone === "danger") && "border-l-[3px]",
        tone === "warning" && "border-l-warning",
        tone === "danger" && "border-l-danger",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[0.8125rem] leading-5 font-medium">{label}</p>
        {Icon && (
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", iconTone)}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="num text-[1.625rem] leading-8 font-semibold tracking-tight">{value}</p>
      {(hint || href) && (
        <p className="text-muted-foreground mt-auto flex items-center gap-1 text-xs">
          <span className="min-w-0 flex-1">{hint}</span>
          {href && <ChevronRight className="size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="group block rounded-xl focus-visible:outline-offset-2">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{it.label}</dt>
          <dd className="mt-0.5 text-sm [overflow-wrap:anywhere]">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
