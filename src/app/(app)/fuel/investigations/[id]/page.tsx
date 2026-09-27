import { Paperclip } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DefinitionList, PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { InvestigationControls } from "@/features/fuel/fuel-actions";
import { TelemetryTable } from "@/features/fuel/fuel-evidence";
import { guard, pageActorWith } from "@/server/page-context";
import { getInvestigation } from "@/server/services/fuel-investigation.service";

export const metadata: Metadata = { title: "Расследование" };

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActorWith("FUEL_VIEW");
  const { investigation: inv, telemetry, userNames, driverName } = toPlain(await guard(getInvestigation(actor, id)));
  return (
    <>
      <PageHeader
        back={actor.isAdmin ? { href: "/admin/fuel", label: "Топливо: проверки" } : { href: "/fuel?tab=checks", label: "Проверки" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.title}
            <StatusBadge kind="FuelInvestigationStatus" value={inv.status} size="lg" />
          </span>
        }
        description={`${inv.vehicle.make} ${inv.vehicle.model} · ${inv.vehicle.plateNumber}${driverName ? ` · водитель ${driverName}` : ""} · открыл ${userNames[inv.openedByUserId] ?? "—"} ${formatDateTime(inv.createdAt)}`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {inv.resolution && (
            <Card>
              <CardContent className="pt-5">
                <p className="font-medium">Итог</p>
                <p>{inv.resolution}</p>
                {inv.closedAt && (
                  <p className="text-muted-foreground text-xs">
                    {userNames[inv.closedByUserId ?? ""] ?? ""} · {formatDateTime(inv.closedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {actor.permissions.has("FUEL_INVESTIGATE") && (
            <Card>
              <CardHeader>
                <CardTitle>Действия</CardTitle>
              </CardHeader>
              <CardContent>
                <InvestigationControls id={inv.id} status={inv.status} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Несоответствия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {inv.anomalies.map((a) => (
                <Link
                  key={a.id}
                  href={`/fuel/anomalies/${a.id}`}
                  className="border-border hover:border-primary/40 block rounded-lg border p-3 text-sm"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{label("FuelAnomalyType", a.type)}</span>
                    <StatusBadge kind="FuelAnomalyStatus" value={a.status} />
                  </span>
                  <span className="text-muted-foreground block">{a.explanation}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Заправки</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>АЗС</TableHead>
                    <TableHead>Литры</TableHead>
                    <TableHead>Карта / водитель</TableHead>
                    <TableHead>Рейс</TableHead>
                    <TableHead>Уровень до → после</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.transactions.map(({ transaction: t }) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDateTime(t.transactionDate)}</TableCell>
                      <TableCell>{t.stationName}</TableCell>
                      <TableCell>{t.liters} л</TableCell>
                      <TableCell>
                        {t.card.label} · {t.driver?.fullName ?? "—"}
                      </TableCell>
                      <TableCell>
                        {t.order ? (
                          <Link className="text-primary hover:underline" href={`/orders/${t.order.id}?tab=fuel`}>
                            {t.order.publicNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {t.levelBefore != null ? `${Math.round(t.levelBefore)} → ${Math.round(t.levelAfter ?? 0)} л` : "нет данных"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>GPS и уровень топлива</CardTitle>
            </CardHeader>
            <CardContent>
              <TelemetryTable points={telemetry} />
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Комментарии</CardTitle>
            </CardHeader>
            <CardContent>
              {inv.comments.length === 0 ? (
                <p className="text-muted-foreground text-sm">Комментариев нет.</p>
              ) : (
                <ul className="space-y-2" data-testid="investigation-comments">
                  {inv.comments.map((c) => (
                    <li key={c.id} className="border-border rounded-lg border p-2 text-sm">
                      <p className="text-muted-foreground text-xs">
                        {userNames[c.authorUserId] ?? "—"} · {formatDateTime(c.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap">{c.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Документы и фото</CardTitle>
            </CardHeader>
            <CardContent>
              {inv.attachments.length === 0 ? (
                <p className="text-muted-foreground text-sm">Файлов нет.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {inv.attachments.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`/api/fuel/investigation-attachments/${f.id}`}
                        className="text-primary inline-flex items-center gap-1.5 hover:underline"
                      >
                        <Paperclip className="size-3.5" aria-hidden /> {f.filename}
                      </a>
                      <span className="text-muted-foreground block text-xs">
                        {userNames[f.uploadedByUserId] ?? ""} · {formatDateTime(f.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <DefinitionList
                items={[
                  {
                    label: "Автомобиль",
                    value: actor.isAdmin ? (
                      inv.vehicle.plateNumber
                    ) : (
                      <Link className="text-primary hover:underline" href={`/fuel/vehicles/${inv.vehicle.id}`}>
                        {inv.vehicle.plateNumber}
                      </Link>
                    ),
                  },
                  { label: "Компания", value: inv.company.legalName },
                  { label: "Ёмкость бака", value: inv.vehicle.tankCapacityLiters ? `${inv.vehicle.tankCapacityLiters} л` : "не указана" },
                ]}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
