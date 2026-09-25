import type { Metadata } from "next";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { COUNTRIES } from "@/lib/geo/countries";
import { enumOptions } from "@/lib/i18n";
import { CURRENCIES } from "@/lib/money";
import { toPlain } from "@/lib/serialize";
import { loadListQuerySchema } from "@/lib/validation/load";
import { LoadCard, type LoadCardData } from "@/features/loads/load-card";
import { pageActorWith, type SearchParams } from "@/server/page-context";
import { listLoads } from "@/server/services/load.service";

export const metadata: Metadata = { title: "Биржа грузов" };

export default async function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("MARKETPLACE_VIEW");
  const params = await searchParams;
  const parsed = loadListQuerySchema.safeParse({ ...params, scope: "marketplace" });
  const q = parsed.success ? parsed.data : loadListQuerySchema.parse({ scope: "marketplace" });
  const data = toPlain(await listLoads(actor, q));
  return (
    <>
      <PageHeader title="Биржа грузов" description={`Опубликованные грузы, доступные для предложений. Найдено: ${data.total}`} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Город, страна, номер заявки…" },
          { type: "text", name: "from", label: "Откуда", placeholder: "Город или код страны" },
          { type: "text", name: "to", label: "Куда", placeholder: "Город или код страны" },
          {
            type: "select",
            name: "country",
            label: "Страна на маршруте",
            options: COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.name}` })),
          },
          { type: "date", name: "dateFrom", label: "Загрузка с" },
          { type: "date", name: "dateTo", label: "Загрузка по" },
          { type: "select", name: "bodyType", label: "Тип кузова", options: enumOptions("BodyType") },
          { type: "number", name: "weightMin", label: "Вес от, кг" },
          { type: "number", name: "weightMax", label: "Вес до, кг" },
          { type: "number", name: "priceMin", label: "Цена от" },
          { type: "number", name: "priceMax", label: "Цена до" },
          { type: "select", name: "currency", label: "Валюта", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
          {
            type: "select",
            name: "sort",
            label: "Сортировка",
            allLabel: "По дате публикации",
            options: [
              { value: "loadingDate", label: "По дате загрузки" },
              { value: "price", label: "Цена ↑" },
              { value: "-price", label: "Цена ↓" },
            ],
          },
          { type: "checkbox", name: "verifiedOnly", label: "Только проверенные компании" },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState
          title="Подходящих грузов не найдено"
          description="Измените фильтры или загляните позже — новые грузы появляются постоянно."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((l) => (
            <LoadCard key={l.id} load={l as unknown as LoadCardData} />
          ))}
        </div>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/marketplace" searchParams={params} />
    </>
  );
}
