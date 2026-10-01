"use client";
import { ArrowRight, FileText, MapPinned, MessageSquare, Phone, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate, formatRelative, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LiveObject } from "@/server/services/operations.service";
import { HealthBadge } from "./health";
import { JourneyTimeline } from "./journey-timeline";

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-overline">{label}</dt>
      <dd className="mt-0.5 truncate text-sm leading-5">{children}</dd>
    </div>
  );
}

/**
 * Контекстная панель перевозки: состояние, срок, позиция, машина, водитель, участники, этапы рейса
 * и переходы к документам, чату и маршруту — без ухода со страницы списка/карты.
 */
export function ShipmentDetailPanel({
  object: o,
  now,
  onClose,
  className,
}: {
  object: LiveObject;
  now: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = new Date(now);
  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-labelledby={`panel-${o.id}`} data-testid="shipment-panel">
      <header className="border-border flex items-start gap-2 border-b px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="id-code text-muted-foreground text-xs font-medium">{o.publicNumber}</span>
            <HealthBadge health={o.health} />
          </div>
          <h2 id={`panel-${o.id}`} className="text-h2 mt-1 truncate">
            {o.origin} <span className="text-muted-foreground font-normal">→</span> {o.destination}
          </h2>
          <p className="text-muted-foreground text-xs">
            {o.statusLabel} · {formatRelative(o.statusChangedAt, ref)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 grid size-9 shrink-0 place-items-center rounded-md transition-colors duration-150"
          aria-label="Закрыть панель"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {o.progress > 0 && (
          <div className="px-4 pt-3">
            <div className="text-meta mb-1 flex justify-between">
              <span>Пройдено по рейсу</span>
              <span className="num">{Math.round(o.progress * 100)}%</span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className={cn(
                  "animate-progress-grow h-full origin-left rounded-full",
                  o.health === "delayed" ? "bg-delayed" : "bg-primary",
                )}
                style={{ width: `${Math.round(o.progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
          <Fact label="Доставка до">
            <span className={cn(o.health === "delayed" && "text-delayed font-medium")}>{formatDate(o.deliveryDate)}</span>
          </Fact>
          <Fact label="Позиция">
            {o.position ? (
              o.position.source === "tracking" ? (
                <>отметка {formatRelative(o.position.at, ref)}</>
              ) : (
                <span className="text-muted-foreground">оценка по маршруту</span>
              )
            ) : (
              <span className="text-muted-foreground">нет данных</span>
            )}
          </Fact>
          <Fact label="Машина">
            {o.vehicle ? (
              <>
                <span className="id-code font-medium">{o.vehicle.plateNumber}</span>{" "}
                <span className="text-muted-foreground">
                  {o.vehicle.make} {o.vehicle.model}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">не назначена</span>
            )}
          </Fact>
          <Fact label="Водитель">
            {o.driver ? (
              <span className="flex items-center gap-1.5">
                <span className="truncate">{o.driver.fullName}</span>
                {o.driver.phone && (
                  <a
                    href={`tel:${o.driver.phone.replace(/\s/g, "")}`}
                    className="text-primary hover:bg-accent grid size-6 shrink-0 place-items-center rounded-sm"
                    aria-label={`Позвонить водителю ${o.driver.fullName}`}
                  >
                    <Phone className="size-3.5" aria-hidden />
                  </a>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">не назначен</span>
            )}
          </Fact>
          <Fact label="Перевозчик">{o.carrier.legalName}</Fact>
          <Fact label="Грузовладелец">{o.shipper.legalName}</Fact>
          <Fact label="Груз" className="col-span-2">
            {o.title}
            {o.weightKg ? <span className="text-muted-foreground"> · {formatWeight(o.weightKg)}</span> : null}
          </Fact>
        </dl>

        <div className="border-border border-t px-4 py-3">
          <h3 className="text-overline mb-2.5">Этапы рейса</h3>
          <JourneyTimeline status={o.status} stops={o.stops} compact />
        </div>
      </div>

      <footer className="border-border grid grid-cols-3 gap-1.5 border-t p-3">
        <Button asChild className="col-span-3" data-testid="panel-open-order">
          <Link href={`/orders/${o.id}`}>
            Открыть перевозку <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/orders/${o.id}?tab=route`}>
            <MapPinned /> Маршрут
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/orders/${o.id}?tab=documents`}>
            <FileText /> Документы
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/orders/${o.id}?tab=chat`}>
            <MessageSquare /> Чат
          </Link>
        </Button>
      </footer>
    </section>
  );
}
