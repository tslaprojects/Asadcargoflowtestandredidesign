import { AlertTriangle, Building2, CheckCircle2, Package, ShieldQuestion, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard, MoneyDisplay, PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActorWith } from "@/server/page-context";
import { adminStats } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Администрирование" };

export default async function AdminDashboard() {
  const actor = await pageActorWith("ADMIN_ORDERS");
  const d = toPlain(await adminStats(actor));
  return (
    <>
      <PageHeader title="Панель администратора" description="Состояние платформы CargoFlow" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Пользователи" value={d.kpi.users} icon={Users} href="/admin/users" />
        <KpiCard label="Компании" value={d.kpi.companies} icon={Building2} href="/admin/companies" />
        <KpiCard label="Грузы" value={d.kpi.loads} icon={Package} href="/admin/loads" hint={`Ставок: ${d.kpi.bids}`} />
        <KpiCard label="Перевозки" value={d.kpi.orders} icon={Truck} href="/admin/orders" />
        <KpiCard
          label="Активные"
          value={d.kpi.active}
          icon={Truck}
          tone="info"
          href="/admin/orders?group=active"
          hint={`В пути: ${d.kpi.inTransit}`}
        />
        <KpiCard label="Завершённые" value={d.kpi.completed} icon={CheckCircle2} tone="success" href="/admin/orders?status=CLOSED" />
        <KpiCard label="Открытые споры" value={d.kpi.disputes} icon={AlertTriangle} tone="danger" href="/admin/disputes" />
        <KpiCard
          label="Ожидают проверки"
          value={d.kpi.pendingVerification}
          icon={ShieldQuestion}
          tone="warning"
          href="/admin/verification"
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Новые компании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.newCompanies.map((c) => (
              <Link
                key={c.id}
                href={`/admin/companies/${c.id}`}
                className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2 text-sm"
              >
                <span>
                  <span className="font-medium">{c.legalName}</span>{" "}
                  <span className="text-muted-foreground">
                    · {label("CompanyType", c.type)} · {c.country} · {formatDate(c.createdAt)}
                  </span>
                </span>
                <StatusBadge kind="VerificationStatus" value={c.verificationStatus} />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Последние заказы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.recentOrders.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{o.publicNumber}</span>{" "}
                  <span className="text-muted-foreground">
                    {o.shipper.legalName} → {o.carrier.legalName}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <MoneyDisplay amount={o.agreedAmount} currency={o.currency} muted />
                  <StatusBadge kind="OrderStatus" value={o.currentStatus} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Новые споры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.newDisputes.length === 0 && <p className="text-muted-foreground text-sm">Открытых споров нет</p>}
            {d.newDisputes.map((x) => (
              <Link
                key={x.id}
                href={`/orders/${x.order.id}?tab=dispute`}
                className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2 text-sm"
              >
                <span>
                  <span className="font-medium">{x.order.publicNumber}</span> · {label("DisputeReason", x.reason)}{" "}
                  <span className="text-muted-foreground">· {formatRelative(x.createdAt)}</span>
                </span>
                <StatusBadge kind="DisputeStatus" value={x.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Подозрительная активность (24 ч)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.suspicious.length === 0 && <p className="text-muted-foreground">Аномалий не обнаружено (≥3 неудачных входа за сутки).</p>}
            {d.suspicious.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="hover:bg-muted flex items-center justify-between rounded-lg p-2">
                <span>
                  {u.firstName} {u.lastName} · {u.email}
                </span>
                <span className="text-danger">неудачных входов: {u.failedLogins}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
