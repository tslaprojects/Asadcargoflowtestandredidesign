import { DataTable, type Column } from "@/components/common/data-table";
import { MoneyDisplay } from "@/components/common/misc";
import { RouteChain } from "@/components/common/route-timeline";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate, formatRelative } from "@/lib/format";

export type OrderRow = {
  id: string;
  publicNumber: string;
  currentStatus: string;
  agreedAmount: number | null;
  currency: string;
  updatedAt: Date;
  loadingDate: Date | null;
  load: {
    originCity?: string | null;
    originCountry?: string | null;
    destinationCity?: string | null;
    destinationCountry?: string | null;
    clientName?: string | null;
    stops?: { country: string; city: string; type: string }[];
  };
  carrier: { legalName: string };
  shipper: { legalName: string };
  vehicle?: { plateNumber: string } | null;
  driver?: { fullName: string } | null;
};

function stopsOf(o: OrderRow) {
  return (
    o.load.stops ?? [
      { country: o.load.originCountry ?? "", city: o.load.originCity ?? "", type: "PICKUP" },
      { country: o.load.destinationCountry ?? "", city: o.load.destinationCity ?? "", type: "DELIVERY" },
    ]
  );
}

export function OrderTable({
  rows,
  perspective,
  empty,
}: {
  rows: OrderRow[];
  perspective: "customer" | "carrier" | "admin" | "forwarder";
  empty?: React.ReactNode;
}) {
  const columns: Column<OrderRow>[] = [
    { key: "number", header: "Номер", cell: (o) => o.publicNumber, primary: true, className: "whitespace-nowrap" },
    { key: "route", header: "Маршрут", cell: (o) => <RouteChain stops={stopsOf(o)} compact /> },
    ...(perspective === "forwarder"
      ? [{ key: "client", header: "Клиент", cell: (o: OrderRow) => o.load.clientName ?? "—", hideOnMobile: true }]
      : []),
    ...(perspective !== "carrier" ? [{ key: "carrier", header: "Перевозчик", cell: (o: OrderRow) => o.carrier.legalName }] : []),
    ...(perspective !== "customer" && perspective !== "forwarder"
      ? [{ key: "shipper", header: "Заказчик", cell: (o: OrderRow) => o.shipper.legalName }]
      : []),
    { key: "status", header: "Статус", cell: (o) => <StatusBadge kind="OrderStatus" value={o.currentStatus} /> },
    { key: "loading", header: "Загрузка", cell: (o) => formatDate(o.loadingDate), hideOnMobile: true },
    {
      key: "amount",
      header: "Сумма",
      cell: (o) => (o.agreedAmount === null ? "—" : <MoneyDisplay amount={o.agreedAmount} currency={o.currency} />),
      className: "text-right",
    },
    {
      key: "updated",
      header: "Обновлено",
      cell: (o) => <span className="text-muted-foreground whitespace-nowrap">{formatRelative(o.updatedAt)}</span>,
      hideOnMobile: true,
    },
  ];
  return (
    <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} rowHref={(o) => `/orders/${o.id}`} empty={empty} caption="Перевозки" />
  );
}
