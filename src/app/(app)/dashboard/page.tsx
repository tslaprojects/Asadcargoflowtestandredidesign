import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Gavel,
  Navigation,
  Package,
  PackagePlus,
  Scale,
  Search,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, cardInteractive, CardTitle } from "@/components/ui/card";
import { DEFAULT_TZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toPlain } from "@/lib/serialize";
import { LoadCard, type LoadCardData } from "@/features/loads/load-card";
import { ActionList } from "@/features/orders/action-list";
import { OrderTable, type OrderRow } from "@/features/orders/order-table";
import { navKindFor, pageActor } from "@/server/page-context";
import { carrierDashboard, customerDashboard, forwarderDashboard } from "@/server/services/dashboard.service";
import { listOrders } from "@/server/services/order.service";
import { nextLoadPreviews } from "@/server/services/next-load.service";

export const metadata: Metadata = { title: "Главная" };

const todayLabel = () =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: DEFAULT_TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-h2">{title}</h2>
      {href && (
        <Link href={href} className="text-primary inline-flex min-h-8 items-center gap-0.5 text-sm font-medium hover:underline">
          {linkLabel} <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "num text-xl leading-7 font-semibold",
          tone === "success" && value > 0 && "text-success",
          tone === "danger" && value > 0 && "text-danger",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

/**
 * Главная: что происходит (KPI) → что требует действия → перевозки в работе → вспомогательное.
 * Каждая цифра — ссылка на список за ней; цвет только у того, что требует внимания.
 */
export default async function DashboardPage() {
  const actor = await pageActor();
  const kind = navKindFor(actor);
  if (kind === "driver") redirect("/driver");
  if (kind === "admin") redirect("/admin");
  if (kind === "none") redirect("/company/new");
  const greeting = `Здравствуйте, ${actor.firstName}`;
  const company = actor.active!.company.legalName;
  const subtitle = (
    <span className="first-letter:uppercase">
      {todayLabel()} · {company}
    </span>
  );

  if (kind === "carrier") {
    const [d, previews] = await Promise.all([carrierDashboard(actor).then(toPlain), nextLoadPreviews(actor)]);
    return (
      <>
        <PageHeader
          title={greeting}
          description={subtitle}
          actions={
            <Button asChild>
              <Link href="/marketplace">
                <Search /> Найти груз
              </Link>
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Активные рейсы" value={d.kpi.activeTrips} icon={Truck} href="/orders?group=active" hint="назначены и в работе" />
          <KpiCard label="В пути" value={d.kpi.inTransit} icon={Navigation} tone="info" href="/orders?group=in_transit" />
          <KpiCard
            label="Свободные машины"
            value={`${d.kpi.freeVehicles} из ${d.kpi.vehicles}`}
            icon={ClipboardList}
            tone={d.kpi.freeVehicles > 0 ? "success" : "neutral"}
            href="/vehicles"
            hint={d.kpi.freeVehicles > 0 ? "можно брать груз" : "весь автопарк занят"}
          />
          <KpiCard label="Грузы на бирже" value={d.kpi.available} icon={Package} href="/marketplace" hint="подходят по кузову и тоннажу" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <ActionList items={d.actions} />
            <section>
              <SectionHeader title="Перевозки" href="/orders" linkLabel="Все перевозки" />
              <OrderTable
                rows={d.recent as unknown as OrderRow[]}
                perspective="carrier"
                empty={
                  <EmptyState
                    icon={Truck}
                    title="Перевозок пока нет"
                    description="Найдите груз на бирже и предложите цену — после выбора заказчиком перевозка появится здесь."
                    action={{ href: "/marketplace", label: "Найти груз" }}
                  />
                }
              />
            </section>
            <section>
              <SectionHeader title="Подходящие грузы" href="/marketplace" linkLabel="Вся биржа" />
              {d.matching.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Новых подходящих грузов нет"
                  description="Подбор учитывает кузов и тоннаж ваших машин. Загляните на биржу — там все опубликованные грузы."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {d.matching.slice(0, 4).map((l) => (
                    <LoadCard key={l.id} load={l as unknown as LoadCardData} />
                  ))}
                </div>
              )}
            </section>
          </div>
          <aside className="space-y-5">
            <Card data-testid="next-load-previews">
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Navigation className="text-primary size-4" aria-hidden /> Следующий рейс
                </CardTitle>
                <Link href="/next-load" className="text-primary inline-flex min-h-8 items-center text-sm font-medium hover:underline">
                  Спланировать
                </Link>
              </CardHeader>
              <CardContent>
                {previews.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Когда машина будет подъезжать к точке разгрузки, здесь появятся грузы для следующего рейса — без порожнего пробега.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {previews.map((p) => (
                      <li key={p.vehicleId}>
                        <Link
                          href={
                            p.movementId
                              ? `/next-load?vehicle=${p.vehicleId}&movement=${p.movementId}`
                              : `/next-load?vehicle=${p.vehicleId}`
                          }
                          className={cn("border-border block rounded-lg border p-3 text-sm", cardInteractive)}
                        >
                          <span className="text-muted-foreground block text-xs">
                            <span className="id-code text-foreground font-medium">{p.plateNumber}</span> · рейс{" "}
                            <span className="id-code">{p.orderNumber}</span>
                          </span>
                          <span className="mt-0.5 block leading-5">{p.message}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle>Итоги</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
                <Stat label="доставлено" value={d.kpi.delivered} tone="success" />
                <Stat label="ставок отправлено" value={d.kpi.bidsCount} />
                <Stat label="машин всего" value={d.kpi.vehicles} />
              </CardContent>
            </Card>
          </aside>
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
          description={subtitle}
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/carriers">
                  <Users /> Перевозчики
                </Link>
              </Button>
              <Button asChild>
                <Link href="/loads/new">
                  <PackagePlus /> Создать груз
                </Link>
              </Button>
            </>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Активные заявки" value={d.kpi.activeLoads} icon={Package} href="/loads" hint="опубликованы и в торгах" />
          <KpiCard label="В пути" value={d.kpi.inTransit} icon={Navigation} tone="info" href="/orders?group=in_transit" />
          <KpiCard
            label="Требуют контроля"
            value={d.kpi.attention}
            icon={AlertTriangle}
            tone={d.kpi.attention > 0 ? "warning" : "neutral"}
            href="/orders?group=attention"
            hint="задержки, споры, документы"
          />
          <KpiCard label="Доставлено" value={d.kpi.delivered} icon={CheckCircle2} href="/orders?group=completed" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 xl:order-1">
            <SectionHeader title="Перевозки" href="/orders" linkLabel="Все перевозки" />
            <OrderTable
              rows={all.items as unknown as OrderRow[]}
              perspective="forwarder"
              empty={
                <EmptyState
                  icon={Truck}
                  title="Перевозок пока нет"
                  description="Создайте груз от имени клиента и выберите перевозчика."
                  action={{ href: "/loads/new", label: "Создать первый груз" }}
                />
              }
            />
          </section>
          <aside className="xl:order-2">
            <ActionList items={d.actions} />
          </aside>
        </div>
      </>
    );
  }

  const d = toPlain(await customerDashboard(actor));
  return (
    <>
      <PageHeader
        title={greeting}
        description={subtitle}
        actions={
          <Button asChild>
            <Link href="/loads/new">
              <PackagePlus /> Создать груз
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Перевозки в работе"
          value={d.kpi.active}
          icon={Truck}
          href="/orders?group=active"
          hint="от выбора перевозчика до доставки"
        />
        <KpiCard label="В пути" value={d.kpi.inTransit} icon={Navigation} tone="info" href="/orders?group=in_transit" />
        <KpiCard
          label="Ждут выбора перевозчика"
          value={d.kpi.awaitingSelection}
          icon={Gavel}
          tone={d.kpi.awaitingSelection > 0 ? "warning" : "neutral"}
          href="/loads?status=BIDDING"
          hint={`предложений получено: ${d.kpi.bidsCount}`}
        />
        <KpiCard
          label="Споры"
          value={d.kpi.disputes}
          icon={Scale}
          tone={d.kpi.disputes > 0 ? "danger" : "neutral"}
          href="/orders?group=attention"
          hint={d.kpi.disputes > 0 ? "нужно ваше решение" : "открытых споров нет"}
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <ActionList items={d.actions} />
          <section>
            <SectionHeader title="Перевозки" href="/orders" linkLabel="Все перевозки" />
            <OrderTable
              rows={d.recent as unknown as OrderRow[]}
              perspective="customer"
              empty={
                <EmptyState
                  icon={Truck}
                  title="Перевозок пока нет"
                  description="Разместите груз — перевозчики предложат цену, а выбранная перевозка появится здесь."
                  action={{ href: "/loads/new", label: "Создать первый груз" }}
                />
              }
            />
          </section>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Итоги</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <Stat label="доставлено" value={d.kpi.delivered} tone="success" />
              <Stat label="грузов создано" value={d.kpi.loadsCount} />
              <Stat label="предложений" value={d.kpi.bidsCount} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Быстрые действия</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline" className="justify-start">
                <Link href="/loads/new">
                  <PackagePlus /> Разместить груз
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/documents">
                  <FolderOpen /> Документы перевозок
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/finance">
                  <Wallet /> Финансы и оплаты
                </Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
