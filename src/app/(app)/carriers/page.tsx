import { ChevronRight, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader, RatingInline } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { toPlain } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listCarriers } from "@/server/services/company.service";
import { carrierNetworkStats } from "@/server/services/operations.service";

export const metadata: Metadata = { title: "Перевозчики" };

/**
 * Перевозчики — участники транспортной сети: доступность машин, водители, ваши активные перевозки с ними,
 * качество работы (рейтинг, завершённые рейсы) и статус проверки документов.
 */
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
  const stats = await carrierNetworkStats(
    actor,
    data.items.map((c) => c.id),
  );
  return (
    <>
      <PageHeader
        title="Перевозчики"
        description="Транспортная сеть: доступность машин, водители и ваши текущие перевозки с каждым перевозчиком. Пригласить перевозчика можно при создании груза («Только приглашённые»)."
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Название или город" },
          { type: "checkbox", name: "verifiedOnly", label: "Только проверенные" },
        ]}
      />
      {data.items.length === 0 ? (
        <EmptyState title="Перевозчики не найдены" description="Измените запрос или снимите фильтр «Только проверенные»." />
      ) : (
        <section className="bg-card overflow-hidden rounded-lg" aria-label="Перевозчики" data-testid="carrier-network">
          <div className="text-overline bg-surface-secondary hairline-b hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_1rem] gap-4 px-4 py-2 lg:grid">
            <span>Перевозчик</span>
            <span>Доступность</span>
            <span>Ваши перевозки</span>
            <span>Качество</span>
            <span />
          </div>
          <ul className="divide-y-(length:--hairline)">
            {data.items.map((c) => {
              const s = stats[c.id];
              return (
                <li key={c.id}>
                  <Link
                    href={`/companies/${c.id}`}
                    className="group hover:bg-surface-secondary grid gap-2 px-4 py-3 transition-colors duration-150 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_1rem] lg:items-center lg:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="group-hover:text-link text-body truncate font-semibold transition-colors">{c.legalName}</p>
                      <p className="text-meta flex flex-wrap items-center gap-2">
                        <span>{c.city}</span>
                        <StatusBadge kind="VerificationStatus" value={c.verificationStatus} />
                      </p>
                    </div>
                    <div className="text-body">
                      <p className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn("size-2 rounded-full", s.available > 0 ? "bg-[var(--map-done)]" : "bg-border-strong")}
                        />
                        <span className={cn(s.available > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                          {s.available > 0 ? `${s.available} свободно` : "нет свободных"}
                        </span>
                      </p>
                      <p className="text-meta flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <Truck className="size-3" aria-hidden /> {s.vehicles} · в рейсе {s.onTrip}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" aria-hidden /> {s.drivers}
                        </span>
                      </p>
                    </div>
                    <div className="text-body min-w-0">
                      {s.withMe.length === 0 ? (
                        <span className="text-muted-foreground">нет активных</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {s.withMe.slice(0, 2).map((o) => (
                            <li key={o.id} className="flex min-w-0 items-center gap-2">
                              <span className="id-code text-muted-foreground text-footnote shrink-0">{o.publicNumber}</span>
                              <span className="truncate">{o.route}</span>
                              <StatusBadge kind="OrderStatus" value={o.status} hideIcon className="hidden xl:inline-flex" />
                            </li>
                          ))}
                          {s.withMe.length > 2 && <li className="text-meta">и ещё {s.withMe.length - 2}</li>}
                        </ul>
                      )}
                    </div>
                    <div className="text-body">
                      <RatingInline value={c.rating?.average ?? null} count={c.rating?.count ?? 0} />
                      <p className="text-meta">завершено рейсов: {c._count.carrierOrders}</p>
                    </div>
                    <ChevronRight className="text-muted-foreground hidden size-4 lg:block" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/carriers" searchParams={params} />
    </>
  );
}
