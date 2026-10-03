"use client";
import { FileText, MapPinned, MessageSquare, Phone, X } from "lucide-react";
import Link from "next/link";
import { InsetGroup, InsetList, ListRow } from "@/components/common/inset-group";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatRelative, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { LiveObject } from "@/server/services/operations.service";
import { HealthBadge } from "./health";
import { JourneyTimeline } from "./journey-timeline";

/**
 * Детали перевозки в правой колонке: состояние, срок, позиция, машина, водитель, участники, этапы рейса
 * и переходы к перевозке, маршруту, документам и чату — без ухода со списка.
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
    <section className={cn("flex h-full min-h-0 flex-col", className)} aria-labelledby={`panel-${o.id}`} data-testid="shipment-panel">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="flex items-start gap-3 px-4 pt-4 pb-4 lg:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="id-code text-footnote text-muted-foreground font-medium">{o.publicNumber}</span>
              <HealthBadge health={o.health} />
            </div>
            <h2 id={`panel-${o.id}`} className="text-title2 mt-1.5 truncate">
              {o.origin} <span className="text-muted-foreground font-normal">→</span> {o.destination}
            </h2>
            <p className="text-subheadline text-muted-foreground">
              {o.statusLabel} · {formatRelative(o.statusChangedAt, ref)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-fill-tertiary text-muted-foreground hover:bg-fill-secondary hover:text-foreground hidden size-7 shrink-0 place-items-center rounded-full transition-colors duration-(--duration-micro) lg:grid"
            aria-label="Закрыть панель"
          >
            <X className="size-3.5 [stroke-width:2.5]" aria-hidden />
          </button>
        </header>

        <div className="space-y-6 px-4 pb-6 lg:px-6">
          {o.progress > 0 && (
            <div className="bg-card rounded-lg px-4 py-3">
              <div className="text-subheadline mb-2 flex justify-between">
                <span className="text-muted-foreground">Пройдено по рейсу</span>
                <span className="num font-medium">{Math.round(o.progress * 100)}%</span>
              </div>
              <Progress value={o.progress * 100} label="Пройдено по рейсу" className={cn(o.health === "delayed" && "[&>div]:bg-delayed")} />
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <InsetGroup header={t("ui.details")}>
              <InsetList>
                <ListRow
                  title="Доставка до"
                  value={
                    <span className={cn("num", o.health === "delayed" && "text-delayed font-medium")}>{formatDate(o.deliveryDate)}</span>
                  }
                />
                <ListRow
                  title="Позиция"
                  value={
                    o.position
                      ? o.position.source === "tracking"
                        ? `отметка ${formatRelative(o.position.at, ref)}`
                        : "оценка по маршруту"
                      : "нет данных"
                  }
                />
                <ListRow
                  title="Машина"
                  value={
                    o.vehicle ? (
                      <span>
                        <span className="id-code text-foreground">{o.vehicle.plateNumber}</span> {o.vehicle.make} {o.vehicle.model}
                      </span>
                    ) : (
                      "не назначена"
                    )
                  }
                />
                <ListRow
                  title="Водитель"
                  value={
                    o.driver ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-foreground">{o.driver.fullName}</span>
                        {o.driver.phone && (
                          <a
                            href={`tel:${o.driver.phone.replace(/\s/g, "")}`}
                            className="text-link bg-accent grid size-7 place-items-center rounded-full"
                            aria-label={`Позвонить водителю ${o.driver.fullName}`}
                          >
                            <Phone className="size-3.5" aria-hidden />
                          </a>
                        )}
                      </span>
                    ) : (
                      "не назначен"
                    )
                  }
                />
                <ListRow title="Перевозчик" value={o.carrier.legalName} />
                <ListRow title="Грузовладелец" value={o.shipper.legalName} />
                <ListRow
                  title="Груз"
                  value={
                    <>
                      {o.title}
                      {o.weightKg ? <> · {formatWeight(o.weightKg)}</> : null}
                    </>
                  }
                />
              </InsetList>
            </InsetGroup>

            <InsetGroup header="Этапы рейса">
              <div className="px-4 py-3.5">
                <JourneyTimeline status={o.status} stops={o.stops} compact />
              </div>
            </InsetGroup>
          </div>
        </div>
      </div>

      <footer className="material-bar hairline-t flex flex-wrap items-center gap-2 px-4 py-3 lg:px-6">
        <Button asChild data-testid="panel-open-order" className="max-sm:w-full">
          <Link href={`/orders/${o.id}`}>Открыть перевозку</Link>
        </Button>
        <div className="flex flex-1 gap-2 sm:flex-none">
          <Button asChild variant="secondary" className="flex-1 sm:flex-none">
            <Link href={`/orders/${o.id}?tab=route`}>
              <MapPinned /> Маршрут
            </Link>
          </Button>
          <Button asChild variant="secondary" className="flex-1 sm:flex-none">
            <Link href={`/orders/${o.id}?tab=documents`}>
              <FileText /> Документы
            </Link>
          </Button>
          <Button asChild variant="secondary" className="flex-1 sm:flex-none">
            <Link href={`/orders/${o.id}?tab=chat`}>
              <MessageSquare /> Чат
            </Link>
          </Button>
        </div>
      </footer>
    </section>
  );
}
