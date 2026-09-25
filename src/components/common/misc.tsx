import { AlertCircle, Inbox, Loader2, ShieldCheck, Star } from "lucide-react";
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
    <div className="mb-5 flex flex-col gap-3 sm:mb-6">
      {back && (
        <Link href={back.href} className="text-muted-foreground hover:text-foreground w-fit text-sm">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
        "border-border bg-card flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="bg-muted mb-3 rounded-full p-3">
        <Icon className="text-muted-foreground size-6" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>}
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
    <div role="alert" className="border-danger-border bg-danger-bg flex flex-col items-center rounded-xl border px-6 py-10 text-center">
      <AlertCircle className="text-danger mb-2 size-6" aria-hidden />
      <p className="text-danger font-medium">{title}</p>
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
    <div className="border-border bg-card space-y-2 rounded-xl border p-4" role="status" aria-label="Загрузка">
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Загрузка страницы">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <TableSkeleton />
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
    <span className={cn("tabular font-medium whitespace-nowrap", muted && "text-muted-foreground font-normal", className)}>
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
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      <span className="text-foreground font-medium">{value.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

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
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    info: "bg-info-bg text-info",
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
  };
  const body = (
    <div className="border-border bg-card flex h-full items-start justify-between gap-3 rounded-xl border p-4 shadow-xs transition-colors hover:border-slate-300">
      <div className="min-w-0">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </div>
      {Icon && (
        <div className={cn("rounded-lg p-2", tones[tone])}>
          <Icon className="size-5" aria-hidden />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block focus-visible:rounded-xl">
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
          <dd className="mt-0.5 text-sm break-words">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
