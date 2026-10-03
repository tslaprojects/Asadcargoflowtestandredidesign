import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader, RatingInline } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { companyAdminListSchema } from "@/lib/validation/company";
import { pageActorWith, type SearchParams } from "@/server/page-context";
import { adminListCompanies } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Компании" };

export default async function AdminCompanies({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_COMPANIES");
  const params = await searchParams;
  const parsed = companyAdminListSchema.safeParse(params);
  const data = toPlain(await adminListCompanies(actor, parsed.success ? parsed.data : { page: 1, pageSize: 20 }));
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Компании" description={`Всего: ${data.total}`} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Название, рег. номер, город" },
          { type: "select", name: "type", label: "Тип", options: enumOptions("CompanyType") },
          { type: "select", name: "verification", label: "Верификация", options: enumOptions("VerificationStatus") },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(c) => c.id}
        rowHref={(c) => `/admin/companies/${c.id}`}
        columns={[
          { key: "name", header: "Компания", primary: true, cell: (c) => c.legalName },
          { key: "type", header: "Тип", cell: (c) => label("CompanyType", c.type) },
          { key: "reg", header: "Рег. номер", cell: (c) => <span className="text-footnote font-mono">{c.registrationNumber}</span> },
          { key: "country", header: "Страна", cell: (c) => c.country },
          { key: "ver", header: "Верификация", cell: (c) => <StatusBadge kind="VerificationStatus" value={c.verificationStatus} /> },
          { key: "members", header: "Сотрудники", cell: (c) => c._count.members, hideOnMobile: true },
          { key: "orders", header: "Заказы", cell: (c) => c._count.shipperOrders + c._count.carrierOrders },
          {
            key: "rating",
            header: "Рейтинг",
            cell: (c) => <RatingInline value={c.rating?.average ?? null} count={c.rating?.count ?? 0} />,
            hideOnMobile: true,
          },
          { key: "created", header: "Создана", cell: (c) => formatDate(c.createdAt), hideOnMobile: true },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/companies" searchParams={params} />
    </>
  );
}
