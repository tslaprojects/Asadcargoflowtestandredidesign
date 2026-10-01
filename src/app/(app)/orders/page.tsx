import type { Metadata } from "next";
import { FilterBar } from "@/components/common/filter-bar";
import { Pagination } from "@/components/common/pagination";
import { ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";
import { orderListQuerySchema } from "@/lib/validation/order";
import { LiveWorkspace } from "@/features/operations/live-workspace";
import { FilteredEmpty, OperationsEmpty } from "@/features/operations/operations-empty";
import { navKindFor, pageActor, type SearchParams } from "@/server/page-context";
import { liveObjectsForOrders } from "@/server/services/operations.service";
import { listOrders } from "@/server/services/order.service";

export const metadata: Metadata = { title: "Перевозки" };

/**
 * Перевозки — split view: список (серверные фильтры, сортировка, пагинация) + карта + контекстная панель.
 * Выбор перевозки не уводит со страницы: детали, маршрут, этапы, документы и чат — в панели.
 */
export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const parsed = orderListQuerySchema.safeParse(params);
  const q = parsed.success ? parsed.data : orderListQuerySchema.parse({});
  const data = await listOrders(actor, q);
  const kind = navKindFor(actor);
  const perspective = kind === "carrier" ? "carrier" : kind === "forwarder" ? "forwarder" : kind === "customer" ? "customer" : "admin";
  const ids = data.items.map((o) => o.id);
  const live = await liveObjectsForOrders(actor, ids);
  const objects = ids.map((id) => live.find((o) => o.id === id)).filter((o) => o !== undefined);
  const statusOptions = Object.entries(ORDER_STATUS_LABELS)
    .filter(([k]) => !["DRAFT", "PUBLISHED", "CARRIER_SELECTION"].includes(k))
    .map(([value, l]) => ({ value, label: l }));
  const selected = typeof params.selected === "string" ? params.selected : null;

  return (
    <LiveWorkspace
      title={kind === "customer" || kind === "carrier" ? "Мои перевозки" : "Перевозки"}
      subtitle={`Найдено: ${data.total}`}
      objects={objects}
      now={new Date().toISOString()}
      initialSelected={selected}
      metrics={false}
      filterInput={false}
      testId="orders-workspace"
      controls={
        <FilterBar
          key="filters"
          bare
          inlineFields={1}
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
      }
      empty={
        Object.keys(params).some((k) => k !== "selected" && k !== "page" && params[k]) ? (
          <FilteredEmpty resetHref="/orders" />
        ) : kind === "carrier" || kind === "customer" || kind === "forwarder" ? (
          <OperationsEmpty kind={kind} />
        ) : (
          <FilteredEmpty />
        )
      }
      listFooter={
        <div key="pagination" className="px-3 pb-3">
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/orders" searchParams={params} />
        </div>
      }
    />
  );
}
