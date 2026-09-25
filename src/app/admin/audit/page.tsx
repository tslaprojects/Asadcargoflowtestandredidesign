import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { AUDIT_ACTION_LABELS, AuditAction } from "@/lib/audit/actions";
import { formatDateTime } from "@/lib/format";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { adminListAudit } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Audit Logs" };

export default async function AdminAudit({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_AUDIT");
  const params = await searchParams;
  const action = sp(params, "action");
  const entityType = sp(params, "entityType");
  const data = toPlain(
    await adminListAudit(actor, {
      q: sp(params, "q"),
      action: action && action in AuditAction ? action : undefined,
      entityType: entityType || undefined,
      page: pageNum(params),
      pageSize: 50,
    }),
  );
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Журнал аудита" description={`Записей: ${data.total}. Журнал только дополняется — удаление записей невозможно.`} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "ID сущности, email, IP" },
          { type: "select", name: "action", label: "Событие", options: Object.values(AuditAction).map((a) => ({ value: a, label: a })) },
          {
            type: "select",
            name: "entityType",
            label: "Сущность",
            options: [
              "User",
              "Company",
              "Load",
              "Bid",
              "TransportOrder",
              "Contract",
              "OrderDocument",
              "Vehicle",
              "DriverProfile",
              "VerificationRequest",
              "PlatformSetting",
            ].map((e) => ({ value: e, label: e })),
          },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(a) => a.id}
        columns={[
          { key: "time", header: "Время", primary: true, cell: (a) => <span className="tabular">{formatDateTime(a.createdAt)}</span> },
          { key: "actor", header: "Пользователь", cell: (a) => (a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : "Система") },
          {
            key: "action",
            header: "Событие",
            cell: (a) => <span title={a.action}>{AUDIT_ACTION_LABELS[a.action as AuditAction] ?? a.action}</span>,
          },
          {
            key: "entity",
            header: "Объект",
            cell: (a) => (
              <span className="font-mono text-xs">
                {a.entityType}:{a.entityId?.slice(0, 8)}
              </span>
            ),
          },
          { key: "company", header: "Компания", cell: (a) => a.company?.legalName ?? "—", hideOnMobile: true },
          { key: "ip", header: "IP", cell: (a) => a.ipAddress ?? "—", hideOnMobile: true },
          {
            key: "data",
            header: "Данные",
            hideOnMobile: true,
            cell: (a) => (
              <details className="max-w-xs">
                <summary className="text-primary cursor-pointer text-xs">показать</summary>
                <pre className="mt-1 max-h-48 overflow-auto text-[11px] whitespace-pre-wrap">
                  {JSON.stringify({ old: a.oldValue, new: a.newValue }, null, 1)}
                </pre>
              </details>
            ),
          },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/audit" searchParams={params} />
    </>
  );
}
