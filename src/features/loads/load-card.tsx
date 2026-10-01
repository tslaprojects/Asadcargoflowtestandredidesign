import { Calendar, Package, Scale, Truck } from "lucide-react";
import Link from "next/link";
import { CompanyBadge, MoneyDisplay } from "@/components/common/misc";
import { RouteChain } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { cardInteractive } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateRange, formatVolume, formatWeight } from "@/lib/format";
import { label } from "@/lib/i18n";

export type LoadCardData = {
  id: string;
  publicNumber: string;
  title: string;
  status: string;
  weightKg: number;
  volumeM3: number | null;
  bodyType: string | null;
  priceType: string;
  targetPrice: number | null;
  currency: string;
  loadingDateFrom: Date;
  loadingDateTo: Date | null;
  deliveryDateFrom: Date | null;
  deliveryDateTo: Date | null;
  stops: { country: string; city: string; type: string }[];
  company: { id: string; legalName: string; verificationStatus: string };
  _count?: { bids: number };
  bids?: { status: string; amount: number; currency: string }[];
};

/**
 * Карточка груза на бирже / в списке.
 * Иерархия для перевозчика: маршрут и цена → что везём → параметры и даты → заказчик.
 * Статус «Опубликован» не показывается (на бирже он у всех), значимые статусы — «Идут торги», «Выбран» и т. п. — видны.
 */
export function LoadCard({ load, showCompany = true }: { load: LoadCardData; showCompany?: boolean }) {
  const myBid = load.bids?.find((b) => b.status === "PENDING" || b.status === "ACCEPTED");
  const quote = load.priceType === "REQUEST_QUOTE" || load.targetPrice === null;
  return (
    <Link
      href={`/loads/${load.id}`}
      className={cn("group border-border bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-xs", cardInteractive)}
      data-testid="load-card"
    >
      <div className="flex items-start justify-between gap-3">
        <RouteChain stops={load.stops} compact className="text-[0.9375rem] leading-6 font-semibold" />
        <div className="shrink-0 text-right">
          {quote ? (
            <span className="text-sm font-semibold">Запрос цены</span>
          ) : (
            <MoneyDisplay amount={load.targetPrice} currency={load.currency} className="text-base font-semibold" />
          )}
          <p className="text-muted-foreground text-xs">{label("PriceType", load.priceType)}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="group-hover:text-primary line-clamp-2 text-sm font-medium transition-colors duration-150">{load.title}</p>
        <p className="text-muted-foreground id-code mt-0.5 text-xs">{load.publicNumber}</p>
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem]">
        <span className="inline-flex items-center gap-1.5">
          <Scale className="size-3.5" aria-hidden />
          <span className="num">
            {formatWeight(load.weightKg)}
            {load.volumeM3 ? ` · ${formatVolume(load.volumeM3)}` : ""}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Truck className="size-3.5" aria-hidden /> {load.bodyType ? label("BodyType", load.bodyType) : "Любой кузов"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3.5" aria-hidden />
          <span>
            <span className="sr-only">Загрузка: </span>
            <span className="num">{formatDateRange(load.loadingDateFrom, load.loadingDateTo)}</span>
          </span>
        </span>
        {(load.deliveryDateFrom || load.deliveryDateTo) && (
          <span className="inline-flex items-center gap-1.5">
            <Package className="size-3.5" aria-hidden />
            <span>
              <span className="sr-only">Доставка: </span>
              <span className="num">{formatDateRange(load.deliveryDateFrom, load.deliveryDateTo)}</span>
            </span>
          </span>
        )}
      </div>
      {(showCompany || load.status !== "PUBLISHED" || myBid || (load._count?.bids ?? 0) > 0) && (
        <div className="border-border mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          {showCompany ? (
            <span className="min-w-0">
              <CompanyBadge name={load.company.legalName} verification={load.company.verificationStatus} link={false} />
            </span>
          ) : (
            <span />
          )}
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            {load._count && load._count.bids > 0 && (
              <span className="text-muted-foreground num text-xs">предложений: {load._count.bids}</span>
            )}
            {load.status !== "PUBLISHED" && <StatusBadge kind="LoadStatus" value={load.status} />}
          </span>
        </div>
      )}
      {myBid && (
        <Badge tone={myBid.status === "ACCEPTED" ? "success" : "info"} className="w-fit">
          Ваше предложение: <MoneyDisplay amount={myBid.amount} currency={myBid.currency} />
        </Badge>
      )}
    </Link>
  );
}
