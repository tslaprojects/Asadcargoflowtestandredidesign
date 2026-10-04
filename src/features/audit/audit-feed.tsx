import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit/actions";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/state-machine/order-state-machine";

export type AuditRow = {
  id: string;
  action: string;
  createdAt: Date | string;
  newValue: unknown;
  oldValue?: unknown;
  actor: { firstName: string; lastName: string } | null;
  company?: { legalName: string } | null;
};

function details(row: AuditRow): string | null {
  const v = (row.newValue ?? {}) as Record<string, unknown>;
  const o = (row.oldValue ?? {}) as Record<string, unknown>;
  switch (row.action) {
    case "BID_CREATED":
    case "BID_ACCEPTED":
      return v.amount ? formatMoney(Number(v.amount), String(v.currency ?? "USD")) : null;
    case "BID_COUNTERED":
      return v.counterAmount ? `встречная цена ${Number(v.counterAmount).toLocaleString("ru-RU")}` : null;
    case "BID_UPDATED":
      return v.amount ? `новая цена ${Number(v.amount).toLocaleString("ru-RU")}` : null;
    case "STATUS_CHANGED":
      return `${ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] ?? o.status} → ${ORDER_STATUS_LABELS[v.status as keyof typeof ORDER_STATUS_LABELS] ?? v.status}${v.comment ? ` · ${v.comment}` : ""}`;
    case "CONTRACT_CREATED":
    case "CONTRACT_SIGNED":
      return [v.documentNumber, v.version && `версия ${v.version}`, v.hash && `hash ${String(v.hash).slice(0, 12)}…`]
        .filter(Boolean)
        .join(", ");
    case "DOCUMENT_UPLOADED":
    case "DOCUMENT_DELETED":
      return String(v.filename ?? o.filename ?? "");
    case "VEHICLE_ASSIGNED":
      return String(v.plateNumber ?? "");
    case "DRIVER_ASSIGNED":
      return String(v.fullName ?? "");
    case "PAYMENT_CREATED":
      return v.amount ? `${formatMoney(Number(v.amount), String(v.currency ?? "USD"))}${v.auto ? " (автоматически)" : ""}` : null;
    case "ORDER_CREATED":
      return String(v.publicNumber ?? "");
    case "LOAD_CANCELLED":
    case "ORDER_CANCELLED":
      return v.reason ? `причина: ${v.reason}` : null;
    case "REVIEW_CREATED":
      return v.rating ? `оценка ${v.rating}/5` : null;
    case "DISPUTE_RESOLVED":
      return v.resolution ? String(v.resolution) : null;
    default:
      return null;
  }
}

/** Лента «История изменений» — каждое событие связано с реальной записью AuditLog. */
export function AuditFeed({ rows, tz }: { rows: AuditRow[]; tz?: string }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-body py-6 text-center">Событий пока нет</p>;
  return (
    <ol className="space-y-0" data-testid="audit-feed">
      {rows.map((r) => {
        const who = r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : "Система";
        const d = details(r);
        return (
          <li
            key={r.id}
            className="hairline-b text-body grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)]"
          >
            <time className="tabular text-muted-foreground" dateTime={new Date(r.createdAt).toISOString()}>
              {formatDateTime(r.createdAt, tz)}
            </time>
            <div className="min-w-0">
              <span className="font-medium">{who}</span>
              {r.company && <span className="text-muted-foreground"> ({r.company.legalName})</span>}{" "}
              {AUDIT_ACTION_LABELS[r.action as AuditAction] ?? r.action}
              {d && <span className="text-muted-foreground block truncate">{d}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
