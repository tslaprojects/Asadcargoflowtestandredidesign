import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listDisputes } from "@/server/services/dispute.service";

export const metadata: Metadata = { title: "Споры" };

export default async function AdminDisputes({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_DISPUTES");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await listDisputes(actor, {
      page: pageNum(params),
      pageSize: 25,
      status: enumOptions("DisputeStatus").some((o) => o.value === status) ? status : undefined,
    }),
  );
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader
        title="Споры"
        description="Откройте спор, чтобы просмотреть детали, написать комментарий, изменить статус или закрыть его."
      />
      <FilterBar fields={[{ type: "select", name: "status", label: "Статус", options: enumOptions("DisputeStatus") }]} />
      <DataTable<Row>
        rows={data.items}
        rowKey={(d) => d.id}
        rowHref={(d) => `/orders/${d.order.id}?tab=dispute`}
        empty={<EmptyState title="Споров нет" />}
        columns={[
          { key: "order", header: "Перевозка", primary: true, cell: (d) => d.order.publicNumber },
          { key: "reason", header: "Причина", cell: (d) => label("DisputeReason", d.reason) },
          { key: "parties", header: "Стороны", cell: (d) => `${d.order.shipper.legalName} / ${d.order.carrier.legalName}` },
          { key: "status", header: "Статус", cell: (d) => <StatusBadge kind="DisputeStatus" value={d.status} /> },
          { key: "comments", header: "Комментарии", cell: (d) => d._count.comments, hideOnMobile: true },
          { key: "date", header: "Открыт", cell: (d) => formatDateTime(d.createdAt) },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/disputes" searchParams={params} />
    </>
  );
}
