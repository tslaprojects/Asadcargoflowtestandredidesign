import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { CompanyBadge, MoneyDisplay } from "@/components/common/misc";
import { RouteDistance, type RouteSummary } from "@/components/common/route-distance";
import { RouteChain } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
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
} & Partial<RouteSummary>;

/**
 * Строка груза в списке, как письмо в Mail: маршрут и цена — первой строкой, что везём — второй,
 * параметры, даты, заказчик и статус — третьей, вторичным цветом.
 * Статус «Опубликован» не показывается (на бирже он у всех), значимые статусы — «Идут торги», «Выбран» и т. п. — видны.
 */
export function LoadCard({ load, showCompany = true }: { load: LoadCardData; showCompany?: boolean }) {
  const myBid = load.bids?.find((b) => b.status === "PENDING" || b.status === "ACCEPTED");
  const quote = load.priceType === "REQUEST_QUOTE" || load.targetPrice === null;
  return (
    <Link
      href={`/loads/${load.id}`}
      className="hover:bg-fill-quaternary active:bg-fill-tertiary flex items-center gap-2 pl-4 transition-colors duration-(--duration-micro)"
      data-testid="load-card"
    >
      <div data-row-content className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-baseline gap-3">
            <RouteChain stops={load.stops} compact className="min-w-0 flex-1 font-semibold" />
            {quote ? (
              <span className="shrink-0 font-semibold">Запрос цены</span>
            ) : (
              <MoneyDisplay amount={load.targetPrice} currency={load.currency} className="text-title3 shrink-0 font-semibold" />
            )}
          </div>
          <div className="flex items-baseline gap-3">
            <p className="min-w-0 flex-1 truncate">
              {load.title} <span className="id-code text-footnote text-muted-foreground">{load.publicNumber}</span>
            </p>
            <span className="text-footnote text-muted-foreground shrink-0">{label("PriceType", load.priceType)}</span>
          </div>
          <p className="text-footnote text-muted-foreground num flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span>
              {formatWeight(load.weightKg)}
              {load.volumeM3 ? ` · ${formatVolume(load.volumeM3)}` : ""} ·{" "}
              {load.bodyType ? label("BodyType", load.bodyType) : "любой кузов"}
            </span>
            <span aria-hidden>·</span>
            <span>
              <span className="sr-only">Загрузка: </span>
              {formatDateRange(load.loadingDateFrom, load.loadingDateTo)}
              {(load.deliveryDateFrom || load.deliveryDateTo) && (
                <>
                  {" "}
                  → <span className="sr-only">доставка: </span>
                  {formatDateRange(load.deliveryDateFrom, load.deliveryDateTo)}
                </>
              )}
            </span>
            {load.routeDistanceKm != null && (
              <>
                <span aria-hidden>·</span>
                <RouteDistance
                  compact
                  route={{
                    routeDistanceKm: load.routeDistanceKm,
                    routeDurationMin: load.routeDurationMin ?? null,
                    routeSource: load.routeSource ?? null,
                  }}
                />
              </>
            )}
          </p>
          {(showCompany || load.status !== "PUBLISHED" || (load._count && load._count.bids > 0) || myBid) && (
            <div className="text-footnote flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
              {showCompany && <CompanyBadge name={load.company.legalName} verification={load.company.verificationStatus} link={false} />}
              {load.status !== "PUBLISHED" && <StatusBadge kind="LoadStatus" value={load.status} />}
              {load._count && load._count.bids > 0 && <span className="text-muted-foreground num">предложений: {load._count.bids}</span>}
              {myBid && (
                <span className={myBid.status === "ACCEPTED" ? "text-success" : "text-link"}>
                  Ваше предложение: <MoneyDisplay amount={myBid.amount} currency={myBid.currency} />
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className="text-tertiary-foreground size-4 shrink-0" aria-hidden />
      </div>
    </Link>
  );
}
