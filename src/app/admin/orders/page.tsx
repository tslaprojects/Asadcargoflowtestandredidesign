import type { Metadata } from "next";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { toPlain } from "@/lib/serialize";
import { ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";
import { orderListQuerySchema } from "@/lib/validation/order";
import { OrderTable, type OrderRow } from "@/features/orders/order-table";
import { pageActorWith, type SearchParams } from "@/server/page-context";
import { listOrders } from "@/server/services/order.service";

export const metadata: Metadata = { title: "Перевозки" };

export default async function AdminOrders({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_ORDERS");
  const params = await searchParams;
  const parsed = orderListQuerySchema.safeParse(params);
  const data = toPlain(await listOrders(actor, parsed.success ? parsed.data : orderListQuerySchema.parse({})));
  return (
    <>
      <PageHeader title="Все перевозки" description={`Всего: ${data.total}`} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Номер, компания, город, госномер" },
          {
            type: "select",
            name: "group",
            label: "Группа",
            options: [
              { value: "active", label: "Активные" },
              { value: "in_transit", label: "В пути" },
              { value: "attention", label: "Требуют контроля" },
              { value: "completed", label: "Завершённые" },
            ],
          },
          {
            type: "select",
            name: "status",
            label: "Статус",
            options: Object.entries(ORDER_STATUS_LABELS).map(([value, l]) => ({ value, label: l })),
          },
          { type: "date", name: "dateFrom", label: "Загрузка с" },
          { type: "date", name: "dateTo", label: "Загрузка по" },
        ]}
      />
      <OrderTable rows={data.items as unknown as OrderRow[]} perspective="admin" />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/orders" searchParams={params} />
    </>
  );
}
