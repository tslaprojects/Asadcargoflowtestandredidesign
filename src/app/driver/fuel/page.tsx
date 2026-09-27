import { CheckCircle2, CreditCard, Fuel, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime } from "@/lib/format";
import { DEMO_STATIONS } from "@/lib/fuel/demo-stations";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { DriverRefuelForm } from "@/features/fuel/driver-fuel";
import { DemoBadge, TankGauge } from "@/features/fuel/fuel-ui";
import { guard, pageActor } from "@/server/page-context";
import { driverFuelView } from "@/server/services/fuel-report.service";

export const metadata: Metadata = { title: "Топливо" };

const hhmm = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** Экран водителя: только своя машина, своя карта и свои заправки. Баланс компании не показывается. */
export default async function DriverFuelPage() {
  const actor = await pageActor();
  const v = toPlain(await guard(driverFuelView(actor)));
  return (
    <div className="space-y-3 pt-1" data-testid="driver-fuel">
      <h1 className="text-2xl font-semibold">Топливо</h1>
      <div className="border-border bg-card rounded-2xl border p-4">
        <p className="text-muted-foreground text-sm">Моя машина</p>
        {v.vehicle ? (
          <p className="text-xl font-semibold">
            {v.vehicle.make} {v.vehicle.model} · <span className="font-mono">{v.vehicle.plateNumber}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">Автомобиль не назначен</p>
        )}
        {v.fuelLevelVisible && v.vehicle && (
          <div className="mt-3">
            <p className="text-muted-foreground mb-1 flex items-center gap-2 text-sm">Топливо {v.fuelLevel?.demo && <DemoBadge />}</p>
            {v.fuelLevel ? (
              <TankGauge liters={v.fuelLevel.liters} capacity={v.vehicle.tankCapacityLiters} />
            ) : (
              <p className="text-muted-foreground">Нет данных датчика</p>
            )}
          </div>
        )}
      </div>

      <div className="border-border bg-card rounded-2xl border p-4" data-testid="driver-card">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CreditCard className="size-4" aria-hidden /> Моя топливная карта {v.card?.isDemo && <DemoBadge />}
        </p>
        {v.card ? (
          <>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
              {v.card.label} {v.card.last4 && <span className="text-muted-foreground font-mono text-sm">•••• {v.card.last4}</span>}
              <StatusBadge kind="FuelCardStatus" value={v.card.status} />
            </p>
            <p
              className={
                v.payment.allowed
                  ? "text-success mt-2 flex items-center gap-2 text-lg font-semibold"
                  : "text-danger mt-2 flex items-center gap-2 text-lg font-semibold"
              }
              data-testid="payment-status"
            >
              {v.payment.allowed ? <CheckCircle2 className="size-6" aria-hidden /> : <XCircle className="size-6" aria-hidden />}{" "}
              {v.payment.message}
            </p>
            <ul className="text-muted-foreground mt-2 space-y-0.5 text-sm">
              {v.remaining?.perTransaction != null && <li>На одну заправку — до {v.remaining.perTransaction} л</li>}
              {v.remaining?.day != null && <li>Сегодня доступно ещё {Math.round(v.remaining.day)} л</li>}
              {v.card.allowedFuelTypes.length > 0 && (
                <li>Топливо: {v.card.allowedFuelTypes.map((f) => label("FuelType", f)).join(", ")}</li>
              )}
              {v.card.allowedFrom != null && (
                <li>
                  Время: {hhmm(v.card.allowedFrom)}–{hhmm(v.card.allowedTo)}
                </li>
              )}
            </ul>
          </>
        ) : (
          <p className="mt-1">{v.payment.message}</p>
        )}
      </div>

      {v.card?.isDemo && v.card.status === "ACTIVE" && (
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            Заправка <DemoBadge />
          </p>
          <p className="text-muted-foreground mb-3 text-sm">
            Демо-режим: при подключённом процессинге заправка регистрируется автоматически при оплате картой.
          </p>
          <DriverRefuelForm stations={DEMO_STATIONS} />
        </div>
      )}

      <div className="border-border bg-card rounded-2xl border p-4">
        <p className="mb-2 font-semibold">Мои заправки</p>
        {v.transactions.length === 0 ? (
          <EmptyState icon={Fuel} title="Заправок пока нет" className="py-6" />
        ) : (
          <ul className="divide-border divide-y text-sm">
            {v.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{t.liters} л</span> · {t.stationName}
                  <span className="text-muted-foreground block text-xs">{formatDateTime(t.transactionDate)}</span>
                </span>
                <StatusBadge kind="FuelTransactionStatus" value={t.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
