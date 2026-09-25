import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader, RatingInline } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { countryFlag } from "@/lib/geo/countries";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listCarriers } from "@/server/services/company.service";

export const metadata: Metadata = { title: "Перевозчики" };

export default async function CarriersPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("CARRIER_DIRECTORY_VIEW");
  const params = await searchParams;
  const data = toPlain(
    await listCarriers(actor, {
      q: sp(params, "q"),
      verifiedOnly: sp(params, "verifiedOnly") === "1",
      page: pageNum(params),
      pageSize: 20,
    }),
  );
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader
        title="Перевозчики"
        description="Каталог транспортных компаний платформы с рейтингом. Пригласить перевозчика можно при создании груза («Только приглашённые»)."
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Название или город" },
          { type: "checkbox", name: "verifiedOnly", label: "Только проверенные" },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(c) => c.id}
        rowHref={(c) => `/companies/${c.id}`}
        empty={<EmptyState title="Перевозчики не найдены" />}
        columns={[
          { key: "name", header: "Компания", primary: true, cell: (c) => c.legalName },
          { key: "loc", header: "Город", cell: (c) => `${countryFlag(c.country)} ${c.city}` },
          { key: "ver", header: "Проверка", cell: (c) => <StatusBadge kind="VerificationStatus" value={c.verificationStatus} /> },
          {
            key: "rating",
            header: "Рейтинг",
            cell: (c) => <RatingInline value={c.rating?.average ?? null} count={c.rating?.count ?? 0} />,
          },
          { key: "veh", header: "Автомобилей", cell: (c) => c._count.vehicles },
          { key: "done", header: "Завершено перевозок", cell: (c) => c._count.carrierOrders },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/carriers" searchParams={params} />
    </>
  );
}
