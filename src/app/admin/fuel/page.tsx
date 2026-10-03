import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { getFuelCardProvider } from "@/lib/fuel/providers";
import { toPlain } from "@/lib/serialize";
import { pageActorWith } from "@/server/page-context";
import { listAnomalies, listInvestigations } from "@/server/services/fuel-investigation.service";

export const metadata: Metadata = { title: "Топливо: проверки" };

/** Администратор платформы: несоответствия и расследования по всем компаниям, состояние интеграций. */
export default async function AdminFuelPage() {
  const actor = await pageActorWith("FUEL_INVESTIGATE");
  const [anomalies, investigations] = await Promise.all([
    listAnomalies(actor, { page: 1, pageSize: 50, allCompanies: true, status: "OPEN" }).then(toPlain),
    listInvestigations(actor, { allCompanies: true }).then(toPlain),
  ]);
  const cardProvider = getFuelCardProvider();
  const integrations = [
    {
      name: "Процессинг топливных карт",
      value: cardProvider.title,
      ok: !cardProvider.demo,
      note: cardProvider.demo ? "демо-режим" : "подключён",
    },
    {
      name: "Webhook процессинга",
      value: "/api/integrations/fuel-cards/:provider/webhook",
      ok: Boolean(process.env.FUEL_CARD_WEBHOOK_SECRET),
      note: process.env.FUEL_CARD_WEBHOOK_SECRET ? "настроен" : "FUEL_CARD_WEBHOOK_SECRET не задан",
    },
    {
      name: "Приём телематики",
      value: "/api/integrations/telematics/:provider/ingest",
      ok: Boolean(process.env.TELEMATICS_WEBHOOK_SECRET),
      note: process.env.TELEMATICS_WEBHOOK_SECRET ? "настроен" : "TELEMATICS_WEBHOOK_SECRET не задан",
    },
  ];
  return (
    <>
      <PageHeader
        title="Топливо: проверки"
        description="Несоответствия и расследования по всем компаниям. Решения по ним принимают владельцы автопарков и администраторы."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Открытые несоответствия ({anomalies.total})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {anomalies.items.length === 0 && <p className="text-muted-foreground text-body">Нет открытых несоответствий.</p>}
            {anomalies.items.map((a) => (
              <Link key={a.id} href={`/fuel/anomalies/${a.id}`} className="hover:border-primary/40 text-body block rounded-lg border p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{label("FuelAnomalyType", a.type)}</span>
                  <StatusBadge kind="FuelAnomalySeverity" value={a.severity} />
                </span>
                <span className="text-muted-foreground text-footnote">
                  {a.company.legalName} · {a.vehicle.plateNumber} · {formatDateTime(a.detectedAt)}
                  {a.isDemo && " · DEMO"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Расследования</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {investigations.length === 0 && <p className="text-muted-foreground text-body">Расследований нет.</p>}
              {investigations.map((i) => (
                <Link
                  key={i.id}
                  href={`/fuel/investigations/${i.id}`}
                  className="hover:border-primary/40 text-body block rounded-lg border p-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{i.title}</span>
                    <StatusBadge kind="FuelInvestigationStatus" value={i.status} />
                  </span>
                  <span className="text-muted-foreground text-footnote">
                    {i.company.legalName} · {formatDateTime(i.createdAt)}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Интеграции</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-body space-y-2" data-testid="fuel-integrations">
                {integrations.map((x) => (
                  <li key={x.name} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{x.name}</span>
                      <span className="text-muted-foreground text-footnote block font-mono">{x.value}</span>
                    </span>
                    <Badge tone={x.ok ? "success" : "warning"}>{x.note}</Badge>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-footnote mt-3">
                Секреты интеграций задаются только переменными окружения и не хранятся в базе данных.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
