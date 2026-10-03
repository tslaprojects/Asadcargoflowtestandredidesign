"use client";
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Fuel,
  Gauge,
  Link2,
  Paperclip,
  Play,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { enumOptions } from "@/lib/i18n";
import { CURRENCIES } from "@/lib/money";
import { EMPTY_LIMITS, limitsBody, type LimitsValue } from "./limits-form";

type Opt = { id: string; label: string };

function LimitsFields({ v, set, currency }: { v: LimitsValue; set: (v: LimitsValue) => void; currency: string }) {
  const f = (k: keyof LimitsValue) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...v, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field id="l-tx" label="На одну заправку, л">
        <Input type="number" min={1} value={v.perTransactionLiters} onChange={f("perTransactionLiters")} />
      </Field>
      <Field id="l-day" label="В день, л">
        <Input type="number" min={1} value={v.dailyLiters} onChange={f("dailyLiters")} />
      </Field>
      <Field id="l-month" label="В месяц, л">
        <Input type="number" min={1} value={v.monthlyLiters} onChange={f("monthlyLiters")} />
      </Field>
      <Field id="l-day-amt" label={`В день, ${currency}`}>
        <Input type="number" min={1} value={v.dailyAmount} onChange={f("dailyAmount")} placeholder="без лимита" />
      </Field>
      <Field id="l-month-amt" label={`В месяц, ${currency}`}>
        <Input type="number" min={1} value={v.monthlyAmount} onChange={f("monthlyAmount")} placeholder="без лимита" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id="l-from" label="С">
          <Input type="time" value={v.allowedFrom} onChange={f("allowedFrom")} />
        </Field>
        <Field id="l-to" label="До">
          <Input type="time" value={v.allowedTo} onChange={f("allowedTo")} />
        </Field>
      </div>
      <fieldset className="sm:col-span-3">
        <legend className="text-body mb-1 font-medium">Разрешённое топливо (пусто — любое)</legend>
        <div className="flex flex-wrap gap-3">
          {enumOptions("FuelType").map((o) => (
            <label key={o.value} className="text-body flex items-center gap-1.5">
              <Checkbox
                checked={v.allowedFuelTypes.includes(o.value)}
                onCheckedChange={(c) =>
                  set({ ...v, allowedFuelTypes: c ? [...v.allowedFuelTypes, o.value] : v.allowedFuelTypes.filter((x) => x !== o.value) })
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="l-brands" label="Сети АЗС (через запятую)" className="sm:col-span-2">
        <Input value={v.allowedStationBrands} onChange={f("allowedStationBrands")} placeholder="любые" />
      </Field>
      <Field id="l-regions" label="Страны (коды)">
        <Input value={v.allowedRegions} onChange={f("allowedRegions")} placeholder="KZ, RU" />
      </Field>
      <label className="text-body flex items-center gap-2 sm:col-span-3">
        <Checkbox checked={v.driverCanSeeFuelLevel} onCheckedChange={(c) => set({ ...v, driverCanSeeFuelLevel: c === true })} />
        Водитель видит текущий уровень топлива
      </label>
    </div>
  );
}

// ─────────── Карты ───────────

export function IssueCardDialog({ vehicles, drivers }: { vehicles: Opt[]; drivers: Opt[] }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ label: "", currency: "KZT", vehicleId: "", driverId: "" });
  const [limits, setLimits] = React.useState(EMPTY_LIMITS);
  const { run, pending } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="issue-card">
        <Plus /> Выпустить карту
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Новая топливная карта</DialogTitle>
            <DialogDescription>
              Карта выпускается у провайдера топливных карт. CargoFlow хранит только идентификатор карты у провайдера и последние 4 цифры —
              номер, PIN и CVV не хранятся.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field id="c-label" label="Номер в компании" required>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="FC-001" maxLength={30} />
            </Field>
            <Field id="c-cur" label="Валюта счёта">
              <NativeSelect value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="c-veh" label="Автомобиль">
              <NativeSelect value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">Не привязан</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="c-drv" label="Водитель">
              <NativeSelect value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                <option value="">Не привязан</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <h3 className="text-body font-semibold">Лимиты</h3>
          <LimitsFields v={limits} set={setLimits} currency={form.currency} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={form.label.trim().length < 2}
              loading={pending}
              onClick={() =>
                run(
                  (key) =>
                    api("/api/fuel/cards", {
                      body: { ...form, vehicleId: form.vehicleId || null, driverId: form.driverId || null, ...limitsBody(limits) },
                      idempotencyKey: key,
                    }),
                  { success: "Карта выпущена", onSuccess: () => setOpen(false) },
                )
              }
            >
              <CreditCard /> Выпустить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CardActions({
  card,
  vehicles,
  drivers,
}: {
  card: {
    id: string;
    label: string;
    status: string;
    vehicleId: string | null;
    driverId: string | null;
    currency: string;
    limits: LimitsValue;
  };
  vehicles: Opt[];
  drivers: Opt[];
}) {
  const { run, pending } = useAction();
  const [limitsOpen, setLimitsOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [limits, setLimits] = React.useState(card.limits);
  const [assign, setAssign] = React.useState({ vehicleId: card.vehicleId ?? "", driverId: card.driverId ?? "" });
  const status = (to: string, success: string) => async (reason: string) =>
    (await run(() => api(`/api/fuel/cards/${card.id}/status`, { body: { status: to, reason: reason || null } }), { success })) !==
    undefined;
  if (card.status === "CANCELLED") return null;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {card.status === "ACTIVE" ? (
        <ConfirmDialog
          title={`Заблокировать карту ${card.label}?`}
          description="Оплата по карте станет невозможной. Водитель получит уведомление."
          withReason
          reasonLabel="Причина"
          destructive
          confirmLabel="Заблокировать"
          onConfirm={status("BLOCKED", "Карта заблокирована")}
          trigger={
            <Button size="sm" variant="ghost" className="text-danger" data-testid={`block-${card.label}`}>
              <Ban /> Заблокировать
            </Button>
          }
        />
      ) : ["BLOCKED", "SUSPENDED"].includes(card.status) ? (
        <ConfirmDialog
          title={`Разблокировать карту ${card.label}?`}
          confirmLabel="Разблокировать"
          onConfirm={status("ACTIVE", "Карта активна")}
          trigger={
            <Button size="sm" variant="outline" data-testid={`unblock-${card.label}`}>
              <Play /> Разблокировать
            </Button>
          }
        />
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setLimitsOpen(true)}>
        <SlidersHorizontal /> Лимиты
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAssignOpen(true)}>
        <Link2 /> Привязка
      </Button>
      {card.status !== "LOST" && (
        <ConfirmDialog
          title={`Карта ${card.label} утеряна?`}
          description="Карта будет навсегда заблокирована у провайдера."
          irreversible
          destructive
          withReason
          confirmLabel="Отметить утерянной"
          onConfirm={status("LOST", "Карта отмечена как утерянная")}
          trigger={
            <Button size="sm" variant="ghost">
              Утеряна
            </Button>
          }
        />
      )}
      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Лимиты карты {card.label}</DialogTitle>
            <DialogDescription>Лимиты проверяются сервером при каждой заправке. Изменение записывается в журнал аудита.</DialogDescription>
          </DialogHeader>
          <LimitsFields v={limits} set={setLimits} currency={card.currency} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitsOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(() => api(`/api/fuel/cards/${card.id}/limits`, { method: "PUT", body: limitsBody(limits) }), {
                  success: "Лимиты обновлены",
                  onSuccess: () => setLimitsOpen(false),
                })
              }
            >
              Сохранить лимиты
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Привязка карты {card.label}</DialogTitle>
          </DialogHeader>
          <Field id="a-veh" label="Автомобиль">
            <NativeSelect value={assign.vehicleId} onChange={(e) => setAssign({ ...assign, vehicleId: e.target.value })}>
              <option value="">Не привязан</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="a-drv" label="Водитель">
            <NativeSelect value={assign.driverId} onChange={(e) => setAssign({ ...assign, driverId: e.target.value })}>
              <option value="">Не привязан</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    api(`/api/fuel/cards/${card.id}/assign`, {
                      method: "PUT",
                      body: { vehicleId: assign.vehicleId || null, driverId: assign.driverId || null },
                    }),
                  { success: "Привязка обновлена", onSuccess: () => setAssignOpen(false) },
                )
              }
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────── Счёт ───────────

export function TopUpDialog({ demo }: { demo: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ amount: "", currency: "KZT", reference: "" });
  const { run, pending } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="topup">
        <Wallet /> Пополнение
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Пополнение топливного счёта</DialogTitle>
            <DialogDescription>
              {demo
                ? "Демо-режим: пополнение фиксируется без реального перевода денег."
                : "CargoFlow не принимает деньги. Зафиксируйте пополнение, выполненное у провайдера топливных карт, с номером платёжного поручения."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field id="t-amt" label="Сумма" required>
              <Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field id="t-cur" label="Валюта">
              <NativeSelect value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field id="t-ref" label="Номер платёжного поручения / операции">
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} maxLength={120} />
          </Field>
          <DialogFooter>
            <Button
              disabled={!(Number(form.amount) > 0)}
              loading={pending}
              onClick={() =>
                run(
                  (key) =>
                    api("/api/fuel/accounts", {
                      body: { ...form, amount: Number(form.amount), reference: form.reference || null },
                      idempotencyKey: key,
                    }),
                  { success: "Пополнение зафиксировано", onSuccess: () => setOpen(false) },
                )
              }
            >
              Зафиксировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Демо-симулятор АЗС ───────────

export type StationPreset = { name: string; brand: string; country: string; latitude: number; longitude: number; price: number };

export function SimulateRefuelDialog({ cards, stations }: { cards: Opt[]; stations: StationPreset[] }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    fuelCardId: cards[0]?.id ?? "",
    station: 0,
    liters: "250",
    price: String(stations[0]?.price ?? 320),
    fuelType: "DIESEL",
  });
  const [result, setResult] = React.useState<string | null>(null);
  const { run, pending } = useAction();
  const st = stations[form.station];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={cards.length === 0} data-testid="simulate-refuel">
        <Fuel /> Симулятор АЗС (DEMO)
      </Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), setResult(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Демо-заправка</DialogTitle>
            <DialogDescription>
              Имитирует операцию процессинга по демо-карте: проверка лимитов → авторизация → завершение → сопоставление с телематикой.
              Данные помечаются как DEMO.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="s-card" label="Карта">
              <NativeSelect value={form.fuelCardId} onChange={(e) => setForm({ ...form, fuelCardId: e.target.value })}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="s-st" label="АЗС">
              <NativeSelect
                value={form.station}
                onChange={(e) =>
                  setForm({ ...form, station: Number(e.target.value), price: String(stations[Number(e.target.value)].price) })
                }
              >
                {stations.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="s-l" label="Литры">
              <Input type="number" min={1} value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} />
            </Field>
            <Field id="s-p" label="Цена за литр">
              <Input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
            <Field id="s-f" label="Топливо">
              <NativeSelect value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })}>
                {enumOptions("FuelType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {result && (
            <p className="bg-muted text-body rounded-lg p-2" role="status">
              {result}
            </p>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              disabled={!form.fuelCardId || !(Number(form.liters) > 0)}
              onClick={() =>
                run(
                  (key) =>
                    api<{
                      approved: boolean;
                      violations: { message: string }[];
                      transaction: { matchStatus: string; anomalyScore: number };
                    }>("/api/fuel/transactions", {
                      body: {
                        fuelCardId: form.fuelCardId,
                        stationName: st.name,
                        stationBrand: st.brand,
                        stationCountry: st.country,
                        latitude: st.latitude,
                        longitude: st.longitude,
                        fuelType: form.fuelType,
                        liters: Number(form.liters),
                        pricePerLiter: Number(form.price),
                      },
                      idempotencyKey: key,
                    }),
                  {
                    onSuccess: (r) =>
                      setResult(
                        r.approved
                          ? `Заправка проведена. Сопоставление: ${r.transaction.matchStatus === "MISMATCH" ? `требуется проверка (балл ${r.transaction.anomalyScore})` : r.transaction.matchStatus === "MATCHED" ? "совпадает" : "недостаточно данных телематики"}.`
                          : `Отклонено: ${r.violations.map((v) => v.message).join(" ")}`,
                      ),
                  },
                )
              }
            >
              Провести заправку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Параметры автомобиля ───────────

export function VehicleFuelSettingsDialog({
  vehicleId,
  initial,
}: {
  vehicleId: string;
  initial: {
    fuelType: string | null;
    engineType: string | null;
    tankCapacityLiters: number | null;
    fuelNormPer100Km: number | null;
    telematicsProvider: string | null;
    telematicsDeviceId: string | null;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [form, setForm] = React.useState({
    fuelType: s(initial.fuelType),
    engineType: s(initial.engineType),
    tankCapacityLiters: s(initial.tankCapacityLiters),
    fuelNormPer100Km: s(initial.fuelNormPer100Km),
    telematicsProvider: s(initial.telematicsProvider),
    telematicsDeviceId: s(initial.telematicsDeviceId),
  });
  const { run, pending } = useAction();
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Settings2 /> Топливо и телематика
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Топливные параметры и телематика</DialogTitle>
            <DialogDescription>Норма расхода задаётся для этого автомобиля. Изменения записываются в журнал аудита.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="v-ft" label="Тип топлива">
              <NativeSelect value={form.fuelType} onChange={f("fuelType")}>
                <option value="">—</option>
                {enumOptions("FuelType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="v-eng" label="Двигатель">
              <Input value={form.engineType} onChange={f("engineType")} placeholder="D26, Euro 6" />
            </Field>
            <Field id="v-tank" label="Ёмкость бака, л">
              <Input type="number" min={1} value={form.tankCapacityLiters} onChange={f("tankCapacityLiters")} />
            </Field>
            <Field id="v-norm" label="Норма расхода, л/100 км">
              <Input type="number" min={1} step="0.1" value={form.fuelNormPer100Km} onChange={f("fuelNormPer100Km")} />
            </Field>
            <Field id="v-tp" label="Провайдер телематики">
              <Input value={form.telematicsProvider} onChange={f("telematicsProvider")} placeholder="не подключено" />
            </Field>
            <Field id="v-td" label="ID устройства у провайдера">
              <Input value={form.telematicsDeviceId} onChange={f("telematicsDeviceId")} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    api(`/api/fuel/vehicles/${vehicleId}`, {
                      method: "PATCH",
                      body: {
                        fuelType: form.fuelType || null,
                        engineType: form.engineType || null,
                        tankCapacityLiters: form.tankCapacityLiters || null,
                        fuelNormPer100Km: form.fuelNormPer100Km || null,
                        telematicsProvider: form.telematicsProvider || null,
                        telematicsDeviceId: form.telematicsDeviceId || null,
                      },
                    }),
                  { success: "Параметры сохранены", onSuccess: () => setOpen(false) },
                )
              }
            >
              <Gauge /> Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Несоответствия и расследования ───────────

export function AnomalyActions({ anomalyId, status, canInvestigate }: { anomalyId: string; status: string; canInvestigate: boolean }) {
  const router = useRouter();
  const { run } = useAction();
  if (!canInvestigate || status !== "OPEN") return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="anomaly-actions">
      <ConfirmDialog
        title="Подтвердить несоответствие?"
        description="Несоответствие будет отмечено как подтверждённое после проверки. Это не обвинение водителя — лишь результат проверки данных."
        withReason
        reasonLabel="Комментарий"
        confirmLabel="Подтвердить"
        onConfirm={async (comment) =>
          (await run(() => api(`/api/fuel/anomalies/${anomalyId}/review`, { body: { decision: "CONFIRM", comment: comment || null } }), {
            success: "Несоответствие подтверждено",
          })) !== undefined
        }
        trigger={
          <Button variant="outline">
            <CheckCircle2 /> Подтвердить
          </Button>
        }
      />
      <ConfirmDialog
        title="Отметить как норму?"
        description="Укажите объяснение (например, чек, фото показаний или сбой датчика)."
        withReason
        reasonRequired
        reasonLabel="Объяснение"
        confirmLabel="Проверено — норма"
        onConfirm={async (comment) =>
          (await run(() => api(`/api/fuel/anomalies/${anomalyId}/review`, { body: { decision: "DISMISS", comment } }), {
            success: "Отмечено как норма",
          })) !== undefined
        }
        trigger={<Button variant="ghost">Проверено — норма</Button>}
      />
      <ConfirmDialog
        title="Открыть расследование?"
        description="Будет создано расследование: заправка, GPS, уровень топлива и рейс будут собраны на одной странице, можно добавлять комментарии и документы."
        withReason
        reasonLabel="Первый комментарий"
        confirmLabel="Открыть расследование"
        onConfirm={async (comment) => {
          const r = await run(
            (key) =>
              api<{ id: string }>("/api/fuel/investigations", {
                body: { anomalyIds: [anomalyId], comment: comment || null },
                idempotencyKey: key,
              }),
            { success: "Расследование открыто", refresh: false },
          );
          if (r) router.push(`/fuel/investigations/${r.id}`);
          return r !== undefined;
        }}
        trigger={
          <Button data-testid="open-investigation">
            <Search /> Открыть расследование
          </Button>
        }
      />
    </div>
  );
}

export function InvestigationControls({ id, status }: { id: string; status: string }) {
  const { run, pending } = useAction();
  const [comment, setComment] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  if (status === "RESOLVED" || status === "DISMISSED") return null;
  const close = (to: string, success: string) => async (resolution: string) =>
    (await run(() => api(`/api/fuel/investigations/${id}`, { method: "PATCH", body: { status: to, resolution } }), { success })) !==
    undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" && (
          <Button
            variant="outline"
            loading={pending}
            onClick={() =>
              run(() => api(`/api/fuel/investigations/${id}`, { method: "PATCH", body: { status: "UNDER_REVIEW" } }), {
                success: "Взято на рассмотрение",
              })
            }
          >
            Взять на рассмотрение
          </Button>
        )}
        <ConfirmDialog
          title="Закрыть расследование с итогом?"
          withReason
          reasonRequired
          reasonLabel="Итог"
          confirmLabel="Решено"
          onConfirm={close("RESOLVED", "Расследование закрыто")}
          trigger={
            <Button variant="success" data-testid="resolve-investigation">
              <CheckCircle2 /> Решено
            </Button>
          }
        />
        <ConfirmDialog
          title="Закрыть без нарушений?"
          description="Несоответствие объяснено, нарушений не выявлено."
          withReason
          reasonRequired
          reasonLabel="Объяснение"
          confirmLabel="Закрыть без нарушений"
          onConfirm={close("DISMISSED", "Расследование закрыто")}
          trigger={<Button variant="ghost">Нарушений нет</Button>}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="inv-comment">Комментарий</Label>
        <Textarea id="inv-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!comment.trim()}
            loading={pending}
            onClick={() =>
              run(() => api(`/api/fuel/investigations/${id}/comments`, { body: { message: comment } }), {
                success: "Комментарий добавлен",
                onSuccess: () => setComment(""),
              })
            }
          >
            Добавить комментарий
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              void run(() => api(`/api/fuel/investigations/${id}/attachments`, { formData: fd }), { success: "Файл приложен" });
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Paperclip /> Приложить документ или фото
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FuelTxActions({ id, status }: { id: string; status: string }) {
  const { run } = useAction();
  const act = (action: string, success: string) => async (reason: string) =>
    (await run((key) => api(`/api/fuel/transactions/${id}/action`, { body: { action, reason }, idempotencyKey: key }), { success })) !==
    undefined;
  const items: React.ReactNode[] = [];
  if (status === "AUTHORIZED" || status === "APPROVED")
    items.push(
      <ConfirmDialog
        key="rev"
        title="Отменить авторизацию?"
        withReason
        reasonRequired
        reasonLabel="Причина"
        confirmLabel="Отменить"
        onConfirm={act("REVERSE", "Авторизация отменена")}
        trigger={
          <Button size="sm" variant="ghost">
            Отменить
          </Button>
        }
      />,
    );
  if (status === "COMPLETED") {
    items.push(
      <ConfirmDialog
        key="ref"
        title="Оформить возврат?"
        description="Сумма вернётся на топливный счёт после подтверждения провайдера."
        withReason
        reasonRequired
        reasonLabel="Причина"
        confirmLabel="Возврат"
        onConfirm={act("REFUND", "Возврат оформлен")}
        trigger={
          <Button size="sm" variant="ghost">
            Возврат
          </Button>
        }
      />,
    );
    items.push(
      <ConfirmDialog
        key="dis"
        title="Оспорить у провайдера?"
        withReason
        reasonRequired
        reasonLabel="Причина"
        confirmLabel="Оспорить"
        onConfirm={act("DISPUTE", "Операция оспорена")}
        trigger={
          <Button size="sm" variant="ghost">
            Оспорить
          </Button>
        }
      />,
    );
  }
  if (status === "DISPUTED") {
    items.push(
      <ConfirmDialog
        key="res"
        title="Спор отклонён провайдером?"
        withReason
        reasonRequired
        reasonLabel="Комментарий"
        confirmLabel="Операция в силе"
        onConfirm={act("RESOLVE_DISPUTE", "Операция подтверждена")}
        trigger={
          <Button size="sm" variant="ghost">
            Спор отклонён
          </Button>
        }
      />,
    );
    items.push(
      <ConfirmDialog
        key="ref2"
        title="Возврат по спору?"
        withReason
        reasonRequired
        reasonLabel="Причина"
        confirmLabel="Возврат"
        onConfirm={act("REFUND", "Возврат оформлен")}
        trigger={
          <Button size="sm" variant="ghost">
            Возврат
          </Button>
        }
      />,
    );
  }
  return items.length ? <div className="flex flex-wrap justify-end gap-1">{items}</div> : null;
}
