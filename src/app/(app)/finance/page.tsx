import { ArrowRight, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listMyPayments } from "@/server/services/payment.service";

export const metadata: Metadata = { title: "Финансы" };

/**
 * Финансы в контексте перевозок: перевозка → перевозчик → ставка → платежи (тип, статус, срок).
 * Итоги по валютам — по всем перевозкам. Платформа не проводит платежи: учёт и безопасная сделка через провайдера.
 */
export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("PAYMENT_VIEW");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await listMyPayments(actor, {
      page: pageNum(params),
      pageSize: 40,
      status: status && ["PLANNED", "INVOICED", "PAID", "CANCELLED"].includes(status) ? status : undefined,
    }),
  );
  type Pay = (typeof data.items)[number];
  const totals = Object.entries(data.totals);
  const groups = new Map<string, { order: Pay["order"]; items: Pay[] }>();
  for (const p of data.items) {
    const g = groups.get(p.order.id) ?? { order: p.order, items: [] };
    g.items.push(p);
    groups.set(p.order.id, g);
  }

  return (
    <>
      <PageHeader
        title="Финансы"
        description="Стоимость перевозок, оплаты и остатки — по каждому рейсу. Платформа не хранит деньги и не проводит платежи сама."
      />
      {totals.length > 0 && (
        <div className="bg-card mb-4 grid divide-y-(length:--hairline) overflow-hidden rounded-lg md:grid-cols-2 md:divide-x-(length:--hairline) md:divide-y-0 xl:grid-cols-4">
          {totals.map(([cur, t]) => (
            <div key={cur} className="px-4 py-3">
              <p className="text-section mb-1.5">{cur}</p>
              <dl className="grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-footnote text-muted-foreground tabular">По договорам</dt>
                  <dd className="text-body font-semibold">
                    <MoneyDisplay amount={t.contracted} currency={cur} />
                  </dd>
                </div>
                <div>
                  <dt className="text-footnote text-muted-foreground tabular">Оплачено</dt>
                  <dd className="text-success text-body font-semibold">
                    <MoneyDisplay amount={t.paid} currency={cur} />
                  </dd>
                </div>
                <div>
                  <dt className="text-footnote text-muted-foreground tabular">Остаток</dt>
                  <dd className="text-warning text-body font-semibold">
                    <MoneyDisplay amount={t.outstanding} currency={cur} />
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
      <FilterBar fields={[{ type: "select", name: "status", label: "Статус платежа", options: enumOptions("PaymentStatus") }]} />
      {groups.size === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Платежей пока нет"
          description="Предоплата, окончательный расчёт и безопасная сделка оформляются во вкладке «Финансы» перевозки."
        />
      ) : (
        <div className="space-y-3" data-testid="finance-groups">
          {[...groups.values()].map(({ order, items }) => (
            <section key={order.id} className="bg-card overflow-hidden rounded-lg" aria-labelledby={`fg-${order.id}`}>
              <header className="bg-surface-secondary hairline-b text-body flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5">
                <h2 id={`fg-${order.id}`} className="font-semibold">
                  <Link href={`/orders/${order.id}?tab=finance`} className="hover:text-link">
                    <span className="id-code text-muted-foreground text-footnote mr-2 font-medium">{order.publicNumber}</span>
                    {order.load.originCity} → {order.load.destinationCity}
                  </Link>
                </h2>
                <ArrowRight className="text-muted-foreground size-3.5" aria-hidden />
                <span className="text-muted-foreground">{order.carrier.legalName}</span>
                <ArrowRight className="text-muted-foreground size-3.5" aria-hidden />
                <span>
                  ставка <MoneyDisplay amount={order.agreedAmount} currency={order.currency} className="font-semibold" />
                </span>
                <span className="ml-auto">
                  <StatusBadge kind="OrderStatus" value={order.currentStatus} />
                </span>
              </header>
              <ul className="divide-y-(length:--hairline)">
                {items.map((p) => (
                  <li
                    key={p.id}
                    className="text-body grid gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{label("PaymentType", p.type)}</span>
                      <span className="text-footnote text-muted-foreground tabular block truncate">
                        {p.payer.legalName} → {p.payee.legalName}
                      </span>
                    </span>
                    <StatusBadge kind="PaymentStatus" value={p.status} />
                    <span className="text-footnote text-muted-foreground tabular sm:text-right">
                      {p.paidAt ? `оплачен ${formatDate(p.paidAt)}` : p.dueDate ? `срок ${formatDate(p.dueDate)}` : "—"}
                    </span>
                    <MoneyDisplay amount={p.amount} currency={p.currency} className="font-semibold sm:text-right" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/finance" searchParams={params} />
    </>
  );
}
