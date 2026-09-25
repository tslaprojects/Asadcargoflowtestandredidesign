import { Download, Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActor, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listMyDocuments } from "@/server/services/document.service";

export const metadata: Metadata = { title: "Документы" };

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const type = sp(params, "type");
  const valid = enumOptions("DocumentType").some((o) => o.value === type);
  const data = toPlain(
    await listMyDocuments(actor, { page: pageNum(params), pageSize: 20, q: sp(params, "q"), type: valid ? (type as "CMR") : undefined }),
  );
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Документы" description="Документы всех ваших перевозок. Файлы выдаются только участникам сделки." />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Имя файла или номер перевозки" },
          {
            type: "select",
            name: "type",
            label: "Тип документа",
            options: enumOptions("DocumentType").filter((o) => o.value !== "CONTRACT"),
          },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(d) => d.id}
        empty={<EmptyState title="Документов пока нет" description="Документы появятся после загрузки в карточке перевозки." />}
        columns={[
          { key: "name", header: "Файл", primary: true, cell: (d) => <span className="font-medium">{d.filename}</span> },
          { key: "type", header: "Тип", cell: (d) => label("DocumentType", d.type) },
          {
            key: "order",
            header: "Перевозка",
            cell: (d) => (
              <Link className="text-primary hover:underline" href={`/orders/${d.order.id}?tab=documents`}>
                {d.order.publicNumber}
              </Link>
            ),
          },
          { key: "size", header: "Размер", cell: (d) => formatFileSize(d.size), hideOnMobile: true },
          { key: "date", header: "Загружен", cell: (d) => formatDateTime(d.createdAt) },
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (d) => (
              <span className="inline-flex gap-3">
                <a
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                  href={`/api/documents/${d.id}/download?inline=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="size-4" aria-hidden /> Открыть
                </a>
                <a className="text-primary inline-flex items-center gap-1 hover:underline" href={`/api/documents/${d.id}/download`}>
                  <Download className="size-4" aria-hidden /> Скачать
                </a>
              </span>
            ),
          },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/documents" searchParams={params} />
    </>
  );
}
