import type { Metadata } from "next";
import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { toPlain } from "@/lib/serialize";
import { ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";
import { orderListQuerySchema } from "@/lib/validation/order";
import { OrderTable, type OrderRow } from "@/features/orders/order-table";
import { navKindFor, pageActor, type SearchParams } from "@/server/page-context";
import { listOrders } from "@/server/services/order.service";

export const metadata: Metadata = { title: "Перевозки" };

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const parsed = orderListQuerySchema.safeParse(params);
  const q = parsed.success ? parsed.data : orderListQuerySchema.parse({});
  const data = toPlain(await listOrders(actor, q));
  const kind = navKindFor(actor);
  const perspective = kind === "carrier" ? "carrier" : kind === "forwarder" ? "forwarder" : kind === "customer" ? "customer" : "admin";
  const statusOptions = Object.entries(ORDER_STATUS_LABELS)
    .filter(([k]) => !["DRAFT", "PUBLISHED", "CARRIER_SELECTION"].includes(k))
    .map(([value, l]) => ({ value, label: l }));
  return (
    <>
      <PageHeader
        title={kind === "customer" || kind === "carrier" ? "Мои перевозки" : "Перевозки"}
        description={`Найдено: ${data.total}`}
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Номер, город, компания, госномер…" },
          {
            type: "select",
            name: "group",
            label: "Группа",
            allLabel: "Все",
            options: [
              { value: "active", label: "Активные" },
              { value: "in_transit", label: "В пути" },
              { value: "attention", label: "Требуют контроля" },
              { value: "completed", label: "Доставленные / закрытые" },
            ],
          },
          { type: "select", name: "status", label: "Статус", options: statusOptions },
          ...(perspective === "forwarder" ? [{ type: "text" as const, name: "client", label: "Клиент" }] : []),
          { type: "date", name: "dateFrom", label: "Загрузка с" },
          { type: "date", name: "dateTo", label: "Загрузка по" },
          {
            type: "select",
            name: "sort",
            label: "Сортировка",
            allLabel: "По обновлению",
            options: [
              { value: "created", label: "По созданию" },
              { value: "loading", label: "По дате загрузки" },
              { value: "amount", label: "По сумме" },
            ],
          },
        ]}
      />
      <OrderTable
        rows={data.items as unknown as OrderRow[]}
        perspective={perspective}
        empty={
          <EmptyState
            title="У вас пока нет активных перевозок"
            description={
              kind === "carrier"
                ? "Найдите груз на бирже и предложите цену."
                : "Создайте груз — после выбора перевозчика здесь появится перевозка."
            }
            action={
              kind === "carrier"
                ? { href: "/marketplace", label: "Найти груз" }
                : kind === "driver"
                  ? undefined
                  : { href: "/loads/new", label: "Создать первый груз" }
            }
          />
        }
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/orders" searchParams={params} />
    </>
  );
}
