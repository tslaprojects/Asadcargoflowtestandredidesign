"use client";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileSignature,
  Loader,
  PackageCheck,
  Pause,
  Play,
  Route,
  Star,
  Truck,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FormError } from "@/components/common/field";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDateTime, formatWeight } from "@/lib/format";
import { enumOptions, label } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";
import {
  availableTransitions,
  DISPUTABLE_STATUSES,
  SELF_CANCELLABLE_STATUSES,
  transitionActionLabel,
  UNASSIGNABLE_STATUSES,
  type ActorSide,
} from "@/lib/state-machine/order-state-machine";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/generated/prisma/enums";
import { DocumentUploader, type UploadedDoc } from "@/features/documents/document-uploader";

type Ctx = {
  orderId: string;
  status: OrderStatus;
  previousStatus: OrderStatus | null;
  side: ActorSide;
  permissions: Permission[];
  hasVehicle: boolean;
  hasDriver: boolean;
  contractSignedByMe: boolean;
  podCount: number;
  requirePod: boolean;
  reviewedByMe: boolean;
  weightKg: number;
  /** Безопасная сделка: статус оплаты (null — не оформлена) */
  secureDealStatus?: string | null;
  receiptConfirmedAt?: Date | string | null;
  confirmationDueAt?: Date | string | null;
  vehicleId?: string | null;
};

const SECURE_HELD = ["PAYMENT_RESERVED", "PAYMENT_RELEASE_PENDING", "PAYMENT_PARTIALLY_RELEASED"];

function useCan(permissions: Permission[]) {
  return (p: Permission) => permissions.includes(p);
}

// ─────────── Назначение автомобиля ───────────

type VehicleOption = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  bodyType: string;
  capacityKg: number;
  volumeM3: number | null;
  gpsEnabled: boolean;
  status: string;
  available: boolean;
  problems: string[];
  warnings: string[];
};

function AssignVehicleDialog({ orderId, weightKg }: { orderId: string; weightKg: number }) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<VehicleOption[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string>("");
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (!open) return;
    api<VehicleOption[]>(`/api/orders/${orderId}/vehicle`)
      .then((o) => {
        setOptions(o);
        setLoadError(null);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, [open, orderId]);

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} data-testid="assign-vehicle">
        <Truck /> Назначить автомобиль
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Назначить автомобиль</DialogTitle>
            <DialogDescription>Вес груза: {formatWeight(weightKg)}. Недоступные автомобили отмечены с причиной.</DialogDescription>
          </DialogHeader>
          <FormError message={loadError} />
          {!options && !loadError && <p className="text-muted-foreground text-body">Загружаем автопарк...</p>}
          {options && options.length === 0 && (
            <p className="text-muted-foreground text-body">
              В автопарке нет автомобилей.{" "}
              <Link href="/vehicles" className="text-link hover:underline">
                Добавить автомобиль
              </Link>
            </p>
          )}
          <div className="max-h-[50vh] space-y-2 overflow-y-auto" role="radiogroup" aria-label="Автомобили">
            {options?.map((v) => (
              <label
                key={v.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md p-3 transition-colors duration-(--duration-micro)",
                  !v.available && "cursor-not-allowed opacity-60",
                  selected === v.id ? "bg-accent ring-primary/40 ring-1 ring-inset" : "bg-fill-quaternary hover:bg-fill-tertiary",
                )}
              >
                <input
                  type="radio"
                  name="vehicle"
                  value={v.id}
                  disabled={!v.available}
                  checked={selected === v.id}
                  onChange={() => setSelected(v.id)}
                  className="mt-1 accent-[var(--primary)]"
                  aria-label={v.plateNumber}
                />
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{v.plateNumber}</span>
                    <span>
                      {v.make} {v.model}
                    </span>
                    <StatusBadge kind="VehicleStatus" value={v.status} />
                  </span>
                  <span className="text-muted-foreground block">
                    {label("BodyType", v.bodyType)} · {formatWeight(v.capacityKg)}
                    {v.volumeM3 ? ` · ${v.volumeM3} м³` : ""} · GPS: {v.gpsEnabled ? "есть" : "нет"}
                  </span>
                  {v.problems.map((p) => (
                    <span key={p} className="text-danger text-footnote block">
                      {p}
                    </span>
                  ))}
                  {v.warnings.map((p) => (
                    <span key={p} className="text-warning text-footnote block">
                      {p}
                    </span>
                  ))}
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!selected}
              loading={pending}
              loadingText="Назначаем..."
              onClick={() =>
                run((key) => api(`/api/orders/${orderId}/vehicle`, { body: { vehicleId: selected }, idempotencyKey: key }), {
                  success: "Автомобиль назначен",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Назначение водителя ───────────

type DriverOption = {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  licenseCategory: string;
  hasAccount: boolean;
  activeTrips: { id: string; publicNumber: string; status: string }[];
  available: boolean;
  problems: string[];
};

function AssignDriverDialog({ orderId }: { orderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<DriverOption[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState("");
  const { run, pending } = useAction();
  React.useEffect(() => {
    if (!open) return;
    api<DriverOption[]>(`/api/orders/${orderId}/driver`)
      .then(setOptions)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [open, orderId]);
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} data-testid="assign-driver">
        <UserPlus /> Назначить водителя
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Назначить водителя</DialogTitle>
            <DialogDescription>Водитель получит уведомление, рейс появится в его приложении «Мой рейс».</DialogDescription>
          </DialogHeader>
          <FormError message={loadError} />
          {options && options.length === 0 && (
            <p className="text-muted-foreground text-body">
              Водители не добавлены.{" "}
              <Link href="/drivers" className="text-link hover:underline">
                Добавить водителя
              </Link>
            </p>
          )}
          <div className="max-h-[50vh] space-y-2 overflow-y-auto" role="radiogroup" aria-label="Водители">
            {options?.map((d) => (
              <label
                key={d.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md p-3 transition-colors duration-(--duration-micro)",
                  !d.available && "cursor-not-allowed opacity-60",
                  selected === d.id ? "bg-accent ring-primary/40 ring-1 ring-inset" : "bg-fill-quaternary hover:bg-fill-tertiary",
                )}
              >
                <input
                  type="radio"
                  name="driver"
                  value={d.id}
                  disabled={!d.available}
                  checked={selected === d.id}
                  onChange={() => setSelected(d.id)}
                  className="mt-1 accent-[var(--primary)]"
                  aria-label={d.fullName}
                />
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{d.fullName}</span>
                    <StatusBadge kind="DriverStatus" value={d.status} />
                    <Badge tone="outline">кат. {d.licenseCategory}</Badge>
                  </span>
                  <span className="text-muted-foreground block">
                    {d.phone} · активных рейсов: {d.activeTrips.length}
                  </span>
                  {d.problems.map((p) => (
                    <span key={p} className="text-danger text-footnote block">
                      {p}
                    </span>
                  ))}
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!selected}
              loading={pending}
              loadingText="Назначаем..."
              onClick={() =>
                run((key) => api(`/api/orders/${orderId}/driver`, { body: { driverId: selected }, idempotencyKey: key }), {
                  success: "Водитель назначен",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Доставка (водитель/перевозчик) ───────────

export function DeliverDialog({ orderId, size = "lg", className }: { orderId: string; size?: "lg" | "xl"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [docs, setDocs] = React.useState<UploadedDoc[]>([]);
  const [comment, setComment] = React.useState("");
  const { run, pending } = useAction();
  const submit = async () => {
    const coords = await currentPosition();
    await run(
      (key) =>
        api(`/api/orders/${orderId}/deliver`, { body: { comment, documentIds: docs.map((d) => d.id), ...coords }, idempotencyKey: key }),
      {
        success: "Доставка отмечена. Заказчик получил уведомление.",
        onSuccess: () => setOpen(false),
      },
    );
  };
  return (
    <>
      <Button size={size} variant="success" className={className} onClick={() => setOpen(true)} data-testid="deliver">
        <PackageCheck /> Груз доставлен
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Груз доставлен</DialogTitle>
            <DialogDescription>Приложите фото и подписанную CMR (подтверждение доставки) и добавьте комментарий.</DialogDescription>
          </DialogHeader>
          <DocumentUploader
            url={`/api/orders/${orderId}/documents`}
            types={["PROOF_OF_DELIVERY", "CMR", "CARGO_PHOTO"]}
            compact
            capture
            refresh={false}
            onUploaded={(d) => setDocs((x) => [...x, d])}
            submitLabel="Приложить файл"
          />
          {docs.length > 0 && (
            <ul className="text-body space-y-1">
              {docs.map((d) => (
                <li key={d.id} className="text-success flex items-center gap-2">
                  <CheckCircle2 className="size-4" aria-hidden /> {label("DocumentType", d.type)}: {d.filename}
                </li>
              ))}
            </ul>
          )}
          <Field id="deliver-comment" label="Комментарий">
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Выгружено без замечаний"
              maxLength={1000}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="success" loading={pending} loadingText="Отправляем..." onClick={submit} data-testid="confirm-deliver">
              Подтвердить доставку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Текущая геопозиция браузера (если пользователь разрешил), иначе пусто. */
export async function currentPosition(timeoutMs = 6000): Promise<{ latitude?: number; longitude?: number; accuracy?: number }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return {};
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({}), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      () => {
        clearTimeout(timer);
        resolve({});
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

// ─────────── Отзыв ───────────

function ReviewDialog({ orderId, counterpart }: { orderId: string; counterpart: string }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ rating: 5, punctuality: 5, communication: 5, documentation: 5, comment: "" });
  const { run, pending } = useAction();
  const stars = (key: "rating" | "punctuality" | "communication" | "documentation", title: string) => (
    <fieldset className="space-y-1">
      <legend className="text-body font-medium">{title}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setV({ ...v, [key]: n })}
            aria-label={`${title}: ${n} из 5`}
            aria-pressed={v[key] >= n}
            className="rounded p-0.5"
          >
            <Star className={cn("size-6", v[key] >= n ? "fill-rating text-rating" : "text-border-strong")} />
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="open-review">
        <Star /> Оставить отзыв
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Отзыв о {counterpart}</DialogTitle>
            <DialogDescription>Отзыв повлияет на рейтинг компании. Изменить его нельзя.</DialogDescription>
          </DialogHeader>
          {stars("rating", "Общая оценка")}
          <div className="grid grid-cols-1 gap-3">
            {stars("punctuality", "Пунктуальность")}
            {stars("communication", "Коммуникация")}
            {stars("documentation", "Документы")}
          </div>
          <Field id="review-comment" label="Комментарий">
            <Textarea rows={3} value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} maxLength={2000} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={pending}
              loadingText="Отправляем..."
              onClick={() =>
                run((key) => api(`/api/orders/${orderId}/review`, { body: v, idempotencyKey: key }), {
                  success: "Спасибо! Отзыв опубликован",
                  onSuccess: () => setOpen(false),
                })
              }
              data-testid="submit-review"
            >
              Отправить отзыв
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Спор ───────────

export function OpenDisputeDialog({ orderId }: { orderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("DELAY");
  const [description, setDescription] = React.useState("");
  const { run, pending } = useAction();
  return (
    <>
      <Button variant="outline" className="text-danger" onClick={() => setOpen(true)}>
        <AlertTriangle /> Открыть спор
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Открыть спор</DialogTitle>
            <DialogDescription>
              Перевозка будет приостановлена (статус «Спор») до решения администратора CargoFlow. Если оформлена безопасная сделка — выплата
              перевозчику замораживается. Документы, фото, трекинг и переписка сохраняются для рассмотрения.
            </DialogDescription>
          </DialogHeader>
          <Field id="dispute-reason" label="Причина" required>
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
              {enumOptions("DisputeReason").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="dispute-desc" label="Описание ситуации" hint="Не менее 10 символов" required>
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={description.trim().length < 10}
              loading={pending}
              loadingText="Открываем..."
              onClick={() =>
                run((key) => api(`/api/orders/${orderId}/dispute`, { body: { reason, description }, idempotencyKey: key }), {
                  success: "Спор открыт. Администратор получил уведомление.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              Открыть спор
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────── Панель «Что дальше» ───────────

export function OrderActions({ ctx, counterpart }: { ctx: Ctx; counterpart: string }) {
  const can = useCan(ctx.permissions);
  const { run, pending } = useAction();
  const { orderId, status, side } = ctx;
  const isCarrier = side === "CARRIER";
  const isCustomer = side === "CUSTOMER";
  const isAdmin = side === "ADMIN";
  const manual = availableTransitions(status, side === "DRIVER" ? "DRIVER" : side, { manualOnly: true }).filter(
    (s) => s !== "CANCELLED" && s !== "ON_HOLD",
  );

  const blocks: React.ReactNode[] = [];

  if (status === "CONTRACT_PENDING" && (isCarrier || isCustomer)) {
    blocks.push(
      ctx.contractSignedByMe ? (
        <p key="signed" className="text-success text-body flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden /> Вы подписали договор. Ожидаем подпись второй стороны.
        </p>
      ) : can("CONTRACT_SIGN") ? (
        <Button key="sign" size="lg" asChild>
          <Link href={`/orders/${orderId}?tab=contract`} scroll={false}>
            <FileSignature /> Подписать договор
          </Link>
        </Button>
      ) : (
        <p key="nosign" className="text-muted-foreground text-body">
          Договор должен подписать руководитель компании.
        </p>
      ),
    );
  }

  if ((isCarrier || isAdmin) && can("ORDER_ASSIGN_VEHICLE")) {
    if (status === "CONTRACT_SIGNED") blocks.push(<AssignVehicleDialog key="veh" orderId={orderId} weightKg={ctx.weightKg} />);
    if (status === "VEHICLE_ASSIGNED" && can("ORDER_ASSIGN_DRIVER")) blocks.push(<AssignDriverDialog key="drv" orderId={orderId} />);
    if (UNASSIGNABLE_STATUSES.includes(status) && ctx.hasVehicle) {
      blocks.push(
        <div key="unassign" className="flex flex-wrap gap-2">
          {ctx.hasDriver && (
            <ConfirmDialog
              title="Снять водителя с рейса?"
              description="Водитель получит уведомление, рейс вернётся на этап назначения водителя."
              confirmLabel="Снять водителя"
              destructive
              onConfirm={async () =>
                (await run(() => api(`/api/orders/${orderId}/driver`, { method: "DELETE" }), { success: "Водитель снят с рейса" })) !==
                undefined
              }
              trigger={
                <Button variant="outline" size="sm">
                  <UserX /> Снять водителя
                </Button>
              }
            />
          )}
          <ConfirmDialog
            title="Снять автомобиль с рейса?"
            description="Автомобиль станет свободным. Если назначен водитель — он тоже будет снят."
            consequences={["Перевозка вернётся на этап «Договор подписан».", "Потребуется назначить транспорт заново."]}
            confirmLabel="Снять с рейса"
            destructive
            onConfirm={async () =>
              (await run(() => api(`/api/orders/${orderId}/vehicle`, { method: "DELETE" }), { success: "Автомобиль снят с рейса" })) !==
              undefined
            }
            trigger={
              <Button variant="outline" size="sm">
                <Ban /> Снять автомобиль
              </Button>
            }
          />
        </div>,
      );
    }
  }

  // Ручные переходы статуса (водитель — в своём приложении; перевозчик/админ — здесь)
  if ((isCarrier || isAdmin || side === "DRIVER") && can("ORDER_STATUS_UPDATE") && manual.length > 0) {
    blocks.push(
      <div key="transitions" className="flex flex-wrap gap-2">
        {manual.map((to) => (
          <ConfirmDialog
            key={to}
            title={`${transitionActionLabel(status, to)}?`}
            description="Статус перевозки изменится, все участники получат уведомление."
            withReason
            reasonLabel="Комментарий"
            confirmLabel="Подтвердить"
            pendingLabel="Обновляем..."
            onConfirm={async (comment) => {
              const coords = side === "DRIVER" ? await currentPosition() : {};
              const r = await run(
                (key) => api(`/api/orders/${orderId}/status`, { body: { status: to, comment, ...coords }, idempotencyKey: key }),
                { success: "Статус перевозки обновлён" },
              );
              return r !== undefined;
            }}
            trigger={
              <Button variant="outline" data-testid={`transition-${to}`}>
                {transitionActionLabel(status, to)}
              </Button>
            }
          />
        ))}
      </div>,
    );
  }

  if (status === "AT_DELIVERY" && (isCarrier || isAdmin || side === "DRIVER") && can("ORDER_STATUS_UPDATE")) {
    blocks.push(<DeliverDialog key="deliver" orderId={orderId} />);
  }

  const secureHeld = SECURE_HELD.includes(ctx.secureDealStatus ?? "");
  const dueText = ctx.confirmationDueAt ? formatDateTime(ctx.confirmationDueAt) : null;
  if (status === "DELIVERED" && ctx.receiptConfirmedAt && secureHeld) {
    blocks.push(
      <p key="payout" className="text-info text-body flex items-center gap-2" data-testid="payout-pending">
        <Loader className="size-4" aria-hidden /> Получение подтверждено. Выплата перевозчику обрабатывается платёжным провайдером —
        перевозка закроется после подтверждения выплаты.
      </p>,
    );
  } else if (status === "DELIVERED" && isCarrier && secureHeld && dueText) {
    blocks.push(
      <p key="await-confirm" className="text-muted-foreground text-body">
        Ожидаем подтверждения получения заказчиком до {dueText}. Если спор не будет открыт, выплата по безопасной сделке выполнится
        автоматически.
      </p>,
    );
  }
  if (status === "DELIVERED" && !ctx.receiptConfirmedAt && (isCustomer || isAdmin) && can("ORDER_CONFIRM_DELIVERY")) {
    const blocked = ctx.requirePod && ctx.podCount === 0;
    blocks.push(
      <div key="confirm" className="space-y-2">
        <p className="text-body font-medium">Подтвердить получение</p>
        {secureHeld && dueText && (
          <p className="text-muted-foreground text-body">
            Проверьте груз и документы до {dueText}. Если есть претензии — откройте спор; иначе после этого срока получение будет
            подтверждено автоматически и перевозчик получит оплату.
          </p>
        )}
        {blocked && (
          <p className="text-warning text-body">
            Перевозчик ещё не загрузил подтверждение доставки (POD/CMR). Закрыть перевозку без него нельзя.
          </p>
        )}
        <ConfirmDialog
          title="Подтвердить получение груза?"
          description={
            secureHeld
              ? "Условия безопасной сделки будут выполнены: выплата перевозчику передаётся платёжному провайдеру."
              : "Перевозка будет закрыта, по остатку будет сформирован окончательный расчёт."
          }
          consequences={
            secureHeld
              ? [
                  "Обеспеченная сумма будет выплачена перевозчику (за вычетом комиссии платформы).",
                  "После подтверждения выплаты перевозка закроется.",
                  "Открыть спор после этого будет нельзя.",
                ]
              : ["Статус перевозки станет «Закрыто».", "Стороны смогут оставить отзывы."]
          }
          irreversible
          withReason
          reasonLabel="Комментарий"
          confirmLabel="Подтвердить получение груза"
          pendingLabel="Подтверждаем..."
          onConfirm={async (comment) => {
            const r = await run((key) => api(`/api/orders/${orderId}/confirm-delivery`, { body: { comment }, idempotencyKey: key }), {
              success: secureHeld ? "Получение подтверждено. Выплата перевозчику запущена." : "Получение подтверждено. Перевозка закрыта.",
            });
            return r !== undefined;
          }}
          trigger={
            <Button size="lg" variant="success" disabled={blocked} data-testid="confirm-delivery">
              <CheckCircle2 /> Подтвердить получение груза
            </Button>
          }
        />
      </div>,
    );
  }

  if (status === "CLOSED" && (isCustomer || isCarrier) && can("REVIEW_CREATE")) {
    blocks.push(
      ctx.reviewedByMe ? (
        <p key="reviewed" className="text-success text-body flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden /> Вы оставили отзыв по этой перевозке
        </p>
      ) : (
        <ReviewDialog key="review" orderId={orderId} counterpart={counterpart} />
      ),
    );
  }

  // Следующий рейс: машина скоро освободится или уже свободна
  if (
    isCarrier &&
    ctx.vehicleId &&
    ["LOADED", "IN_TRANSIT", "AT_BORDER", "CUSTOMS", "BORDER_CLEARED", "AT_DELIVERY", "DELIVERED", "CLOSED"].includes(status)
  ) {
    blocks.push(
      <Button key="next-load" variant="outline" asChild>
        <Link href={`/next-load?vehicle=${ctx.vehicleId}`}>
          <Route /> Найти следующий рейс
        </Link>
      </Button>,
    );
  }

  // Второстепенные действия
  const secondary: React.ReactNode[] = [];
  if ((isCustomer || isCarrier) && can("DISPUTE_CREATE") && DISPUTABLE_STATUSES.includes(status)) {
    secondary.push(<OpenDisputeDialog key="dispute" orderId={orderId} />);
  }
  if ((isCustomer || isCarrier) && can("ORDER_CANCEL")) {
    if (SELF_CANCELLABLE_STATUSES.includes(status)) {
      secondary.push(
        <ConfirmDialog
          key="cancel"
          title="Отменить перевозку?"
          description="Договор будет аннулирован, груз — отменён."
          irreversible
          destructive
          withReason
          reasonRequired
          reasonLabel="Причина отмены"
          confirmLabel="Отменить перевозку"
          pendingLabel="Отменяем..."
          onConfirm={async (reason) =>
            (await run((key) => api(`/api/orders/${orderId}/cancel`, { body: { reason }, idempotencyKey: key }), {
              success: "Перевозка отменена",
            })) !== undefined
          }
          trigger={
            <Button variant="ghost" className="text-danger">
              <Ban /> Отменить перевозку
            </Button>
          }
        />,
      );
    } else if (!["CLOSED", "CANCELLED", "DISPUTED"].includes(status)) {
      secondary.push(
        <Tooltip key="cancel-disabled" content="После подписания договора отмена выполняется через процедуру спора/администратора.">
          <span tabIndex={0}>
            <Button variant="ghost" disabled>
              <Ban /> Отменить перевозку
            </Button>
          </span>
        </Tooltip>,
      );
    }
  }
  if (isAdmin && !["CLOSED", "CANCELLED"].includes(status)) {
    if (status === "ON_HOLD") {
      secondary.push(
        <Button
          key="resume"
          variant="outline"
          loading={pending}
          onClick={() =>
            run(() => api(`/api/admin/orders/${orderId}/hold`, { body: { hold: false } }), { success: "Перевозка возобновлена" })
          }
        >
          <Play /> Возобновить
        </Button>,
      );
    } else if (status !== "DISPUTED") {
      secondary.push(
        <ConfirmDialog
          key="hold"
          title="Приостановить перевозку?"
          withReason
          confirmLabel="Приостановить"
          onConfirm={async (comment) =>
            (await run(() => api(`/api/admin/orders/${orderId}/hold`, { body: { hold: true, comment } }), {
              success: "Перевозка приостановлена",
            })) !== undefined
          }
          trigger={
            <Button variant="outline">
              <Pause /> Приостановить
            </Button>
          }
        />,
      );
    }
    secondary.push(
      <ConfirmDialog
        key="admin-cancel"
        title="Отменить перевозку (администратор)?"
        irreversible
        destructive
        withReason
        reasonRequired
        reasonLabel="Причина отмены"
        confirmLabel="Отменить перевозку"
        onConfirm={async (reason) =>
          (await run((key) => api(`/api/orders/${orderId}/cancel`, { body: { reason }, idempotencyKey: key }), {
            success: "Перевозка отменена",
          })) !== undefined
        }
        trigger={
          <Button variant="ghost" className="text-danger">
            <Ban /> Отменить (админ)
          </Button>
        }
      />,
    );
  }

  if (blocks.length === 0 && secondary.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="order-actions">
      {blocks.length > 0 && <div className="flex flex-col items-start gap-3">{blocks}</div>}
      {secondary.length > 0 && <div className="hairline-t flex flex-wrap gap-2 pt-3">{secondary}</div>}
      {status === "DISPUTED" && (
        <p className="text-danger text-body">По перевозке открыт спор — действия приостановлены до решения администратора.</p>
      )}
    </div>
  );
}
