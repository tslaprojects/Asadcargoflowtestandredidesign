import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { MoneyDisplay, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate, formatWeight } from "@/lib/format";
import { enumOptions } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { adminListLoads } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Грузы" };

export default async function AdminLoads({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_ORDERS");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await adminListLoads(actor, {
      q: sp(params, "q"),
      status: enumOptions("LoadStatus").some((o) => o.value === status) ? status : undefined,
      page: pageNum(params),
      pageSize: 25,
    }),
  );
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Все грузы" description={`Всего: ${data.total}`} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Номер, название, компания" },
          { type: "select", name: "status", label: "Статус", options: enumOptions("LoadStatus") },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(l) => l.id}
        rowHref={(l) => `/loads/${l.id}`}
        columns={[
          { key: "num", header: "Номер", primary: true, cell: (l) => l.publicNumber },
          { key: "title", header: "Груз", cell: (l) => l.title },
          { key: "route", header: "Маршрут", cell: (l) => `${l.originCity} → ${l.destinationCity}` },
          { key: "company", header: "Компания", cell: (l) => l.company.legalName },
          { key: "weight", header: "Вес", cell: (l) => formatWeight(l.weightKg), hideOnMobile: true },
          {
            key: "price",
            header: "Цена",
            cell: (l) => (l.targetPrice ? <MoneyDisplay amount={l.targetPrice} currency={l.currency} /> : "—"),
          },
          { key: "bids", header: "Ставок", cell: (l) => l._count.bids },
          { key: "status", header: "Статус", cell: (l) => <StatusBadge kind="LoadStatus" value={l.status} /> },
          { key: "date", header: "Создан", cell: (l) => formatDate(l.createdAt), hideOnMobile: true },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/loads" searchParams={params} />
    </>
  );
}
