import { BadgeCheck, ChevronLeft, ChevronRight, Inbox, Loader2, Star, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { countryName } from "@/lib/geo/countries";
import { t } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Заголовок экрана: кнопка «назад» в стиле iOS, крупный заголовок, действия справа. */
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
    <header className="mb-5 flex flex-col gap-1">
      {back && (
        <Link
          href={back.href}
          className="text-link text-body -ml-1.5 inline-flex min-h-9 w-fit items-center gap-0.5 rounded-sm pr-1.5 hover:opacity-70 lg:min-h-7"
        >
          <ChevronLeft className="size-5 [stroke-width:2.25] lg:size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-large-title">{title}</h1>
          {description && <div className="text-subheadline text-muted-foreground mt-0.5">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Пустое состояние, как ContentUnavailableView: серый символ, заголовок, пояснение, действие. */
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
    <div className={cn("animate-fade-in flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <Icon className="text-tertiary-foreground mb-3 size-10 [stroke-width:1.5]" aria-hidden />
      <p className="text-title3">{title}</p>
      {description && <p className="text-subheadline text-muted-foreground mt-1 max-w-sm text-pretty">{description}</p>}
      {action &&
        (action.href ? (
          <Button asChild variant="secondary" className="text-link mt-4">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="secondary" className="text-link mt-4" onClick={action.onClick}>
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
    <div role="alert" className="animate-fade-in flex flex-col items-center px-6 py-12 text-center">
      <TriangleAlert className="text-danger mb-3 size-10 [stroke-width:1.5]" aria-hidden />
      <p className="text-title3">{title}</p>
      {description && <p className="text-subheadline text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {retry && <div className="mt-4">{retry}</div>}
    </div>
  );
}

export function LoadingState({ label = t("common.loading") }: { label?: string }) {
  return (
    <div role="status" className="text-subheadline text-muted-foreground flex items-center justify-center gap-2 py-12">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-card overflow-hidden rounded-lg" role="status" aria-label="Загрузка">
      <div className="hairline-b flex gap-6 px-3 py-2.5">
        {[18, 26, 14, 12].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-6 px-3 py-3", i % 2 === 1 && "bg-fill-quaternary")}>
          <Skeleton className="h-3 w-[16%]" />
          <Skeleton className="h-3 w-[28%]" />
          <Skeleton className="h-3 w-[12%]" />
          <Skeleton className="ml-auto h-3 w-[9%]" />
        </div>
      ))}
    </div>
  );
}

/** Скелетон страницы: повторяет структуру — заголовок, сводка, список или основная колонка с боковой. */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "detail" | "dashboard" }) {
  return (
    <div className="space-y-6" role="status" aria-label="Загрузка страницы">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      {variant !== "detail" && (
        <div className="bg-card grid grid-cols-2 gap-px overflow-hidden rounded-lg lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2.5 p-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      )}
      {variant === "list" ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="bg-card space-y-4 rounded-lg p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="bg-card space-y-3 rounded-lg p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-2/5" />
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

/** Город и код страны (без эмодзи-флагов: на Windows они превращаются в буквы). */
export function CountryLabel({ code, city, className }: { code: string | null | undefined; city?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1", className)} title={countryName(code)}>
      <span>{city ?? countryName(code)}</span>
      {city && code && <span className="text-caption text-tertiary-foreground font-medium tracking-wide">{code}</span>}
    </span>
  );
}

export function VerificationBadge({ status, className }: { status: string; className?: string }) {
  if (status !== "VERIFIED") return null;
  return (
    <span className={cn("text-link inline-flex items-center", className)} title="Компания прошла проверку CargoFlow">
      <BadgeCheck className="size-4 lg:size-3.5" aria-hidden />
      <span className="sr-only">Проверена</span>
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
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
  if (!value) return <span className="text-footnote text-muted-foreground">нет отзывов</span>;
  return (
    <span
      className="text-footnote text-muted-foreground num inline-flex items-center gap-0.5"
      aria-label={`Рейтинг ${value} из 5, отзывов: ${count}`}
    >
      <Star className="fill-rating text-rating size-3" aria-hidden />
      <span className="text-foreground font-medium">{value.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}

/**
 * Сводная цифра: подпись, крупное число, пояснение. Без значков — смысл несут цифра и подпись.
 * Цвет получает только число, требующее внимания (warning/danger) или подтверждающее успех.
 */
export function KpiCard({
  label,
  value,
  hint,
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
  const valueTone = { neutral: "", info: "", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  const body = (
    <div
      className={cn(
        "bg-card flex h-full flex-col rounded-lg px-4 py-3",
        href && "group-hover:bg-surface-secondary group-active:bg-muted transition-colors duration-(--duration-micro)",
      )}
    >
      <p className="text-footnote text-muted-foreground flex items-center justify-between gap-2 font-medium">
        <span className="min-w-0 truncate">{label}</span>
        {href && <ChevronRight className="text-tertiary-foreground size-3.5 shrink-0" aria-hidden />}
      </p>
      <p className={cn("text-figure mt-1", valueTone)}>{value}</p>
      {hint && <p className="text-footnote text-muted-foreground mt-auto pt-1">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="group block rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Свойства объекта, как в инспекторе: подпись слева, значение справа; на узком экране — друг под другом. */
export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-footnote text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 [overflow-wrap:anywhere]">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Скелетон трёх колонок: список слева, детали справа (Операции, Перевозки, Автопарк). */
export function WorkspaceSkeleton({ label = "Загрузка рабочего пространства" }: { label?: string }) {
  return (
    <div className="flex h-full" role="status" aria-label={label}>
      <div className="hairline-r bg-card w-full space-y-1 p-3 lg:w-[21rem] lg:shrink-0">
        <Skeleton className="mx-1 h-6 w-32" />
        <Skeleton className="mx-1 mt-3 h-7 w-[calc(100%-0.5rem)] rounded-md" />
        <div className="pt-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5 px-1 py-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-1 p-4 lg:block">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    </div>
  );
}
