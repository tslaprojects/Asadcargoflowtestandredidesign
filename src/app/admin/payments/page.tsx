import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { getPaymentProvider } from "@/lib/payments/provider";
import { SECURE_DEAL_STATUSES } from "@/lib/state-machine/payment-state-machine";
import { toPlain } from "@/lib/serialize";
import { RunTimeoutsButton } from "@/features/admin/secure-deal-admin";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { listSecureDeals } from "@/server/services/secure-deal.service";

export const metadata: Metadata = { title: "Безопасные сделки" };

export default async function AdminPayments({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_PAYMENTS");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await listSecureDeals(actor, {
      page: pageNum(params),
      pageSize: 25,
      status: (SECURE_DEAL_STATUSES as string[]).includes(status ?? "") ? status : undefined,
    }),
  );
  const provider = getPaymentProvider();
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader
        title="Безопасные сделки"
        description="Обеспеченные платежи, выплаты и возвраты. Движение средств выполняет платёжный провайдер; здесь — статусы, операции и ручное подтверждение."
        actions={<RunTimeoutsButton />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Провайдер:</span>
        <Badge tone={provider.testMode ? "warning" : "info"}>{provider.title}</Badge>
        {provider.testMode && <span className="text-muted-foreground">реальные деньги не движутся</span>}
        {data.pendingOperations > 0 && <Badge tone="warning">Операций ожидают подтверждения: {data.pendingOperations}</Badge>}
      </div>
      <FilterBar
        fields={[
          {
            type: "select",
            name: "status",
            label: "Статус",
            options: SECURE_DEAL_STATUSES.map((s) => ({ value: s, label: label("PaymentStatus", s) })),
          },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(p) => p.id}
        rowHref={(p) => `/orders/${p.order.id}?tab=finance`}
        empty={<EmptyState title="Безопасных сделок нет" />}
        columns={[
          { key: "order", header: "Перевозка", primary: true, cell: (p) => p.order.publicNumber },
          { key: "parties", header: "Заказчик → перевозчик", cell: (p) => `${p.payer.legalName} → ${p.payee.legalName}` },
          { key: "amount", header: "Сумма", cell: (p) => <MoneyDisplay amount={p.amount} currency={p.currency} /> },
          {
            key: "moved",
            header: "Выплачено / возвращено",
            hideOnMobile: true,
            cell: (p) => (
              <span className="text-sm">
                <MoneyDisplay amount={p.releasedAmount} currency={p.currency} /> /{" "}
                <MoneyDisplay amount={p.refundedAmount} currency={p.currency} />
              </span>
            ),
          },
          {
            key: "status",
            header: "Статус",
            cell: (p) => (
              <span className="flex flex-col gap-1">
                <StatusBadge kind="PaymentStatus" value={p.status} />
                {p.transactions.length > 0 && (
                  <span className="text-warning text-xs">Ожидает: {label("PaymentTransactionKind", p.transactions[0].kind)}</span>
                )}
              </span>
            ),
          },
          {
            key: "order-status",
            header: "Перевозка",
            hideOnMobile: true,
            cell: (p) => <StatusBadge kind="OrderStatus" value={p.order.currentStatus} />,
          },
          { key: "updated", header: "Обновлено", cell: (p) => formatDateTime(p.updatedAt) },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/payments" searchParams={params} />
    </>
  );
}
