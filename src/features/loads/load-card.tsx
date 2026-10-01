import { Calendar, Scale } from "lucide-react";
import Link from "next/link";
import { CompanyBadge, MoneyDisplay } from "@/components/common/misc";
import { RouteChain } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
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
 * Строка груза на бирже / в списке (плотный операционный список вместо сетки карточек).
 * Иерархия: маршрут и что везём → параметры → даты → заказчик/статус/предложения → цена.
 * Статус «Опубликован» не показывается (на бирже он у всех), значимые статусы — «Идут торги», «Выбран» и т. п. — видны.
 */
export function LoadCard({ load, showCompany = true }: { load: LoadCardData; showCompany?: boolean }) {
  const myBid = load.bids?.find((b) => b.status === "PENDING" || b.status === "ACCEPTED");
  const quote = load.priceType === "REQUEST_QUOTE" || load.targetPrice === null;
  return (
    <Link
      href={`/loads/${load.id}`}
      className="group hover:bg-surface-secondary focus-visible:outline-ring grid gap-x-5 gap-y-2 px-4 py-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 md:grid-cols-[minmax(0,1fr)_15rem_13rem_8.5rem] md:items-center"
      data-testid="load-card"
    >
      <div className="min-w-0">
        <RouteChain stops={load.stops} compact className="text-sm leading-5 font-semibold" />
        <p className="group-hover:text-primary truncate text-sm transition-colors duration-150">{load.title}</p>
        <p className="text-muted-foreground id-code text-xs">{load.publicNumber}</p>
      </div>
      <div className="text-muted-foreground min-w-0 space-y-0.5 text-xs">
        <p className="flex min-w-0 items-center gap-1.5">
          <Scale className="size-3.5 shrink-0" aria-hidden />
          <span className="num truncate">
            {formatWeight(load.weightKg)}
            {load.volumeM3 ? ` · ${formatVolume(load.volumeM3)}` : ""} · {load.bodyType ? label("BodyType", load.bodyType) : "любой кузов"}
          </span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <Calendar className="size-3.5 shrink-0" aria-hidden />
          <span className="num truncate">
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
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm md:flex-col md:items-start">
        {showCompany && <CompanyBadge name={load.company.legalName} verification={load.company.verificationStatus} link={false} />}
        <span className="flex flex-wrap items-center gap-1.5">
          {load.status !== "PUBLISHED" && <StatusBadge kind="LoadStatus" value={load.status} />}
          {load._count && load._count.bids > 0 && (
            <span className="text-muted-foreground num text-xs">предложений: {load._count.bids}</span>
          )}
        </span>
        {myBid && (
          <Badge tone={myBid.status === "ACCEPTED" ? "success" : "info"} className="w-fit">
            Ваше предложение: <MoneyDisplay amount={myBid.amount} currency={myBid.currency} />
          </Badge>
        )}
      </div>
      <div className="flex items-baseline gap-2 md:block md:text-right">
        {quote ? (
          <span className="text-sm font-semibold">Запрос цены</span>
        ) : (
          <MoneyDisplay amount={load.targetPrice} currency={load.currency} className="text-base font-semibold" />
        )}
        <p className="text-muted-foreground text-xs">{label("PriceType", load.priceType)}</p>
      </div>
    </Link>
  );
}
