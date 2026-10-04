import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { adminListDocuments } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Документы" };

export default async function AdminDocuments({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_ORDERS");
  const params = await searchParams;
  const data = toPlain(await adminListDocuments(actor, { q: sp(params, "q"), page: pageNum(params), pageSize: 25 }));
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Документы перевозок" description={`Всего: ${data.total}. Включая удалённые и предыдущие версии.`} />
      <FilterBar fields={[{ type: "search", name: "q", placeholder: "Имя файла или номер перевозки" }]} />
      <DataTable<Row>
        rows={data.items}
        rowKey={(d) => d.id}
        columns={[
          {
            key: "file",
            header: "Файл",
            primary: true,
            cell: (d) =>
              d.status === "DELETED" ? (
                d.filename
              ) : (
                <a
                  className="text-link hover:underline"
                  href={`/api/documents/${d.id}/download?inline=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {d.filename}
                </a>
              ),
          },
          { key: "type", header: "Тип", cell: (d) => label("DocumentType", d.type) },
          {
            key: "order",
            header: "Перевозка",
            cell: (d) => (
              <Link className="text-link hover:underline" href={`/orders/${d.order.id}?tab=documents`}>
                {d.order.publicNumber}
              </Link>
            ),
          },
          { key: "ver", header: "Версия", cell: (d) => d.version },
          {
            key: "status",
            header: "Статус",
            cell: (d) => (
              <Badge tone={d.status === "ACTIVE" ? "success" : d.status === "DELETED" ? "danger" : "neutral"}>
                {d.status === "ACTIVE" ? "актуальный" : d.status === "DELETED" ? "удалён" : "предыдущая версия"}
              </Badge>
            ),
          },
          { key: "size", header: "Размер", cell: (d) => formatFileSize(d.size), hideOnMobile: true },
          { key: "date", header: "Загружен", cell: (d) => formatDateTime(d.createdAt) },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/documents" searchParams={params} />
    </>
  );
}
