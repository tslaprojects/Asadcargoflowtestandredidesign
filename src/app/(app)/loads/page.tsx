import { PackagePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { enumOptions } from "@/lib/i18n";
import { isCustomerRole } from "@/lib/permissions";
import { toPlain } from "@/lib/serialize";
import { loadListQuerySchema } from "@/lib/validation/load";
import { LoadCard, type LoadCardData } from "@/features/loads/load-card";
import { pageActor, type SearchParams } from "@/server/page-context";
import { listLoads } from "@/server/services/load.service";

export const metadata: Metadata = { title: "Мои грузы" };

export default async function MyLoadsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  if (!isCustomerRole(actor.active?.role)) redirect("/marketplace");
  const params = await searchParams;
  const parsed = loadListQuerySchema.safeParse({ ...params, scope: "mine" });
  const q = parsed.success ? parsed.data : loadListQuerySchema.parse({ scope: "mine" });
  const data = toPlain(await listLoads(actor, q));
  return (
    <>
      <PageHeader
        title={actor.active?.role === "FORWARDER" ? "Грузы" : "Мои грузы"}
        description="Все грузы вашей компании: черновики, опубликованные, в торгах и в перевозке."
        actions={
          <Button asChild>
            <Link href="/loads/new">
              <PackagePlus /> Создать груз
            </Link>
          </Button>
        }
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Номер, название, город…" },
          { type: "select", name: "status", label: "Статус", options: enumOptions("LoadStatus") },
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
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState
          title="У вас пока нет грузов"
          description="Создайте груз — это займёт пару минут."
          action={{ href: "/loads/new", label: "Создать первый груз" }}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((l) => (
            <LoadCard key={l.id} load={l as unknown as LoadCardData} showCompany={false} />
          ))}
        </div>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/loads" searchParams={params} />
    </>
  );
}
