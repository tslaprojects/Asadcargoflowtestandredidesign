import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/common/data-table";
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

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("PAYMENT_VIEW");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await listMyPayments(actor, {
      page: pageNum(params),
      pageSize: 20,
      status: status && ["PLANNED", "INVOICED", "PAID", "CANCELLED"].includes(status) ? status : undefined,
    }),
  );
  type Row = (typeof data.items)[number];
  const totals = Object.entries(data.totals);
  return (
    <>
      <PageHeader
        title="Финансы"
        description="Финансовый учёт по перевозкам: стоимость, предоплаты, оплаты и остатки. Платформа не проводит платежи."
      />
      {totals.length > 0 && (
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {totals.map(([cur, t]) => (
            <div key={cur} className="border-border bg-card rounded-xl border p-4">
              <p className="text-sm font-medium">{cur}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">По договорам</dt>
                  <dd>
                    <MoneyDisplay amount={t.contracted} currency={cur} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Оплачено</dt>
                  <dd>
                    <MoneyDisplay amount={t.paid} currency={cur} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Остаток</dt>
                  <dd>
                    <MoneyDisplay amount={t.outstanding} currency={cur} className="text-warning" />
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
      <FilterBar fields={[{ type: "select", name: "status", label: "Статус платежа", options: enumOptions("PaymentStatus") }]} />
      <DataTable<Row>
        rows={data.items}
        rowKey={(p) => p.id}
        empty={<EmptyState title="Платежей пока нет" description="Платежи фиксируются во вкладке «Финансы» перевозки." />}
        columns={[
          {
            key: "order",
            header: "Перевозка",
            primary: true,
            cell: (p) => (
              <Link className="text-primary hover:underline" href={`/orders/${p.order.id}?tab=finance`}>
                {p.order.publicNumber}
              </Link>
            ),
          },
          { key: "type", header: "Тип", cell: (p) => label("PaymentType", p.type) },
          { key: "amount", header: "Сумма", cell: (p) => <MoneyDisplay amount={p.amount} currency={p.currency} /> },
          { key: "status", header: "Статус", cell: (p) => <StatusBadge kind="PaymentStatus" value={p.status} /> },
          {
            key: "payer",
            header: "Плательщик → получатель",
            cell: (p) => `${p.payer.legalName} → ${p.payee.legalName}`,
            hideOnMobile: true,
          },
          {
            key: "date",
            header: "Оплачен / срок",
            cell: (p) => (p.paidAt ? formatDate(p.paidAt) : p.dueDate ? `до ${formatDate(p.dueDate)}` : "—"),
          },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/finance" searchParams={params} />
    </>
  );
}
