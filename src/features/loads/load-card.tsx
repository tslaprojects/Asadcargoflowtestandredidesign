import { Calendar, Package, Scale, Truck } from "lucide-react";
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

/** Карточка груза на бирже / в списке. */
export function LoadCard({ load, showCompany = true }: { load: LoadCardData; showCompany?: boolean }) {
  const myBid = load.bids?.find((b) => b.status === "PENDING" || b.status === "ACCEPTED");
  return (
    <Link
      href={`/loads/${load.id}`}
      className="group border-border bg-card hover:border-primary/40 flex flex-col gap-3 rounded-xl border p-4 shadow-xs transition-colors hover:shadow-sm"
      data-testid="load-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{load.publicNumber}</p>
          <p className="group-hover:text-primary truncate font-semibold">{load.title}</p>
        </div>
        <StatusBadge kind="LoadStatus" value={load.status} />
      </div>
      <RouteChain stops={load.stops} className="text-sm font-medium" />
      <div className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Scale className="size-4" aria-hidden /> {formatWeight(load.weightKg)}
          {load.volumeM3 ? ` · ${formatVolume(load.volumeM3)}` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Truck className="size-4" aria-hidden /> {load.bodyType ? label("BodyType", load.bodyType) : "Любой кузов"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-4" aria-hidden /> Загрузка: {formatDateRange(load.loadingDateFrom, load.loadingDateTo)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Package className="size-4" aria-hidden /> Доставка: {formatDateRange(load.deliveryDateFrom, load.deliveryDateTo)}
        </span>
      </div>
      <div className="border-border mt-auto space-y-2 border-t pt-3">
        {showCompany && (
          <div className="min-w-0 text-sm">
            <CompanyBadge name={load.company.legalName} verification={load.company.verificationStatus} link={false} />
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          {load.priceType === "REQUEST_QUOTE" || load.targetPrice === null ? (
            <span className="text-base font-semibold">Запрос цены</span>
          ) : (
            <MoneyDisplay amount={load.targetPrice} currency={load.currency} className="text-lg font-semibold" />
          )}
          <span className="text-muted-foreground text-right text-xs">
            {label("PriceType", load.priceType)}
            {load._count && load._count.bids > 0 && ` · предложений: ${load._count.bids}`}
          </span>
        </div>
      </div>
      {myBid && (
        <Badge tone={myBid.status === "ACCEPTED" ? "success" : "info"} className="w-fit">
          Ваше предложение: <MoneyDisplay amount={myBid.amount} currency={myBid.currency} />
        </Badge>
      )}
    </Link>
  );
}
