import { AlertTriangle, CheckCircle2, Clock, Gavel, Navigation, Package, PackagePlus, Search, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toPlain } from "@/lib/serialize";
import { LoadCard, type LoadCardData } from "@/features/loads/load-card";
import { ActionList } from "@/features/orders/action-list";
import { OrderTable, type OrderRow } from "@/features/orders/order-table";
import { navKindFor, pageActor } from "@/server/page-context";
import { carrierDashboard, customerDashboard, forwarderDashboard } from "@/server/services/dashboard.service";
import { listOrders } from "@/server/services/order.service";
import { nextLoadPreviews } from "@/server/services/next-load.service";

export const metadata: Metadata = { title: "Главная" };

export default async function DashboardPage() {
  const actor = await pageActor();
  const kind = navKindFor(actor);
  if (kind === "driver") redirect("/driver");
  if (kind === "admin") redirect("/admin");
  if (kind === "none") redirect("/company/new");
  const greeting = `Здравствуйте, ${actor.firstName}!`;
  const company = actor.active!.company.legalName;

  if (kind === "carrier") {
    const [d, previews] = await Promise.all([carrierDashboard(actor).then(toPlain), nextLoadPreviews(actor)]);
    return (
      <>
        <PageHeader
          title={greeting}
          description={`${company} · перевозчик`}
          actions={
            <Button asChild size="lg">
              <Link href="/marketplace">
                <Search /> Найти груз
              </Link>
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Доступные грузы" value={d.kpi.available} icon={Package} tone="info" href="/marketplace" />
          <KpiCard label="Мои активные рейсы" value={d.kpi.activeTrips} icon={Truck} tone="warning" href="/orders?group=active" />
          <KpiCard label="В пути" value={d.kpi.inTransit} icon={Truck} tone="info" href="/orders?group=in_transit" />
          <KpiCard label="Доставлено" value={d.kpi.delivered} icon={CheckCircle2} tone="success" href="/orders?group=completed" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-5">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Подходящие грузы</CardTitle>
                <Link href="/marketplace" className="text-primary text-sm hover:underline">
                  Вся биржа →
                </Link>
              </CardHeader>
              <CardContent>
                {d.matching.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Под параметры вашего автопарка сейчас нет новых грузов.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {d.matching.map((l) => (
                      <LoadCard key={l.id} load={l as unknown as LoadCardData} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <section>
              <h2 className="mb-3 text-base font-semibold">Последние перевозки</h2>
              <OrderTable
                rows={d.recent as unknown as OrderRow[]}
                perspective="carrier"
                empty={
                  <EmptyState
                    title="У вас пока нет активных перевозок"
                    description="Найдите груз на бирже и предложите цену."
                    action={{ href: "/marketplace", label: "Найти груз" }}
                  />
                }
              />
            </section>
          </div>
          <div className="space-y-5">
            <Card data-testid="next-load-previews">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="text-primary size-4" aria-hidden /> Следующий рейс
                </CardTitle>
                <Link href="/next-load" className="text-primary text-sm hover:underline">
                  Спланировать →
                </Link>
              </CardHeader>
              <CardContent>
                {previews.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Когда машина будет подъезжать к точке разгрузки, здесь появятся подходящие грузы для следующего рейса.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {previews.map((p) => (
                      <li key={p.vehicleId}>
                        <Link
                          href={
                            p.movementId
                              ? `/next-load?vehicle=${p.vehicleId}&movement=${p.movementId}`
                              : `/next-load?vehicle=${p.vehicleId}`
                          }
                          className="border-border hover:border-primary/40 block rounded-lg border p-3 text-sm transition-colors"
                        >
                          <span className="text-muted-foreground block text-xs">
                            <span className="font-mono">{p.plateNumber}</span> · рейс {p.orderNumber}
                          </span>
                          <span className="font-medium">{p.message}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <ActionList items={d.actions} title="Ожидают моего действия" />
            <Card>
              <CardHeader>
                <CardTitle>Автопарк</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-2xl font-semibold">{d.kpi.vehicles}</p>
                  <p className="text-muted-foreground">всего</p>
                </div>
                <div>
                  <p className="text-success text-2xl font-semibold">{d.kpi.freeVehicles}</p>
                  <p className="text-muted-foreground">свободно</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{d.kpi.bidsCount}</p>
                  <p className="text-muted-foreground">ставок</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  if (kind === "forwarder") {
    const d = toPlain(await forwarderDashboard(actor));
    const all = toPlain(await listOrders(actor, { page: 1, pageSize: 10, group: "all", sort: "updated" }));
    return (
      <>
        <PageHeader
          title={greeting}
          description={`${company} · экспедитор`}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/carriers">Найти перевозчика</Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/loads/new">
                  <PackagePlus /> Создать груз
                </Link>
              </Button>
            </>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Активные заявки" value={d.kpi.activeLoads} icon={Package} tone="info" href="/loads" />
          <KpiCard label="Перевозки в пути" value={d.kpi.inTransit} icon={Truck} tone="info" href="/orders?group=in_transit" />
          <KpiCard label="Требуют контроля" value={d.kpi.attention} icon={AlertTriangle} tone="warning" href="/orders?group=attention" />
          <KpiCard label="Доставлено" value={d.kpi.delivered} icon={CheckCircle2} tone="success" href="/orders?group=completed" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Все мои перевозки</h2>
              <Link href="/orders" className="text-primary text-sm hover:underline">
                Фильтры и все перевозки →
              </Link>
            </div>
            <OrderTable
              rows={all.items as unknown as OrderRow[]}
              perspective="forwarder"
              empty={<EmptyState title="У вас пока нет перевозок" action={{ href: "/loads/new", label: "Создать первый груз" }} />}
            />
          </section>
          <ActionList items={d.actions} />
        </div>
      </>
    );
  }

  const d = toPlain(await customerDashboard(actor));
  return (
    <>
      <PageHeader
        title={greeting}
        description={`${company} · грузовладелец`}
        actions={
          <Button asChild size="lg">
            <Link href="/loads/new">
              <PackagePlus /> Создать груз
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Активные перевозки" value={d.kpi.active} icon={Truck} tone="info" href="/orders?group=active" />
        <KpiCard
          label="Ожидают выбора"
          value={d.kpi.awaitingSelection}
          icon={Gavel}
          tone="warning"
          href="/loads?status=BIDDING"
          hint="Опубликованные грузы"
        />
        <KpiCard label="В пути" value={d.kpi.inTransit} icon={Clock} tone="info" href="/orders?group=in_transit" />
        <KpiCard label="Доставлено" value={d.kpi.delivered} icon={CheckCircle2} tone="success" href="/orders?group=completed" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <h2 className="mb-3 text-base font-semibold">Последние перевозки</h2>
          <OrderTable
            rows={d.recent as unknown as OrderRow[]}
            perspective="customer"
            empty={
              <EmptyState
                title="У вас пока нет активных перевозок"
                description="Разместите груз — перевозчики предложат цену."
                action={{ href: "/loads/new", label: "Создать первый груз" }}
              />
            }
          />
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="border-border bg-card rounded-xl border p-3">
              <p className="text-muted-foreground">Грузов</p>
              <p className="text-xl font-semibold">{d.kpi.loadsCount}</p>
            </div>
            <div className="border-border bg-card rounded-xl border p-3">
              <p className="text-muted-foreground">Ставок получено</p>
              <p className="text-xl font-semibold">{d.kpi.bidsCount}</p>
            </div>
            <div className="border-border bg-card rounded-xl border p-3">
              <p className="text-muted-foreground">В споре</p>
              <p className="text-xl font-semibold">{d.kpi.disputes}</p>
            </div>
          </div>
        </section>
        <ActionList items={d.actions} />
      </div>
    </>
  );
}
