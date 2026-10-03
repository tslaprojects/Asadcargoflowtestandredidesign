"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, Truck, Unlink } from "lucide-react";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FormError } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { COUNTRIES } from "@/lib/geo/countries";
import { enumOptions } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const form = z.object({
  plateNumber: z.string().trim().min(3, "Укажите госномер"),
  country: z.string().length(2),
  make: z.string().trim().min(1, "Укажите марку"),
  model: z.string().trim().min(1, "Укажите модель"),
  year: z.string().optional(),
  vehicleType: z.string().min(1),
  bodyType: z.string().min(1),
  capacityKg: z.string().refine((v) => Number(v) > 0, "Грузоподъёмность должна быть больше 0"),
  volumeM3: z.string().optional(),
  vin: z.string().max(17, "VIN — не более 17 символов").optional(),
  gpsEnabled: z.boolean(),
  status: z.string().optional(),
});
type Values = z.infer<typeof form>;

export type VehicleRow = {
  id: string;
  plateNumber: string;
  country: string;
  make: string;
  model: string;
  year: number | null;
  vehicleType: string;
  bodyType: string;
  capacityKg: number;
  volumeM3: number | null;
  vin: string | null;
  gpsEnabled: boolean;
  status: string;
};

export function VehicleFormDialog({ vehicle, trigger }: { vehicle?: VehicleRow; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const f = useForm<Values>({
    resolver: zodResolver(form),
    defaultValues: vehicle
      ? {
          ...vehicle,
          year: vehicle.year ? String(vehicle.year) : "",
          capacityKg: String(vehicle.capacityKg),
          volumeM3: vehicle.volumeM3 ? String(vehicle.volumeM3) : "",
          vin: vehicle.vin ?? "",
          status: vehicle.status === "ASSIGNED" ? undefined : vehicle.status,
        }
      : {
          plateNumber: "",
          country: "KZ",
          make: "",
          model: "",
          year: "",
          vehicleType: "TRACTOR_TRAILER",
          bodyType: "CURTAINSIDER",
          capacityKg: "20000",
          volumeM3: "",
          vin: "",
          gpsEnabled: true,
          status: "AVAILABLE",
        },
  });
  const gpsEnabled = useWatch({ control: f.control, name: "gpsEnabled" });
  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      const body = { ...v, capacityKg: Number(v.capacityKg), volumeM3: v.volumeM3 || null, year: v.year || null, vin: v.vin || null };
      if (vehicle) await api(`/api/vehicles/${vehicle.id}`, { method: "PATCH", body });
      else await api("/api/vehicles", { body });
      toast.success(vehicle ? "Автомобиль обновлён" : "Автомобиль добавлен");
      setOpen(false);
      if (!vehicle) f.reset();
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.fields)
        for (const [k, m] of Object.entries(e.fields)) f.setError(k as keyof Values, { message: m[0] });
      setError(errorMessage(e));
    }
  });
  const e = f.formState.errors;
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{vehicle ? `Редактирование ${vehicle.plateNumber}` : "Добавить автомобиль"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate>
            <div className="sm:col-span-3">
              <FormError message={error} />
            </div>
            <Field id="v-plate" label="Госномер" error={e.plateNumber?.message} required>
              <Input {...f.register("plateNumber")} />
            </Field>
            <Field id="v-country" label="Страна регистрации" required>
              <NativeSelect {...f.register("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="v-year" label="Год выпуска" error={e.year?.message}>
              <Input type="number" inputMode="numeric" {...f.register("year")} />
            </Field>
            <Field id="v-make" label="Марка" error={e.make?.message} required>
              <Input {...f.register("make")} />
            </Field>
            <Field id="v-model" label="Модель" error={e.model?.message} required>
              <Input {...f.register("model")} />
            </Field>
            <Field id="v-vin" label="VIN" error={e.vin?.message}>
              <Input {...f.register("vin")} />
            </Field>
            <Field id="v-type" label="Тип транспорта" required>
              <NativeSelect {...f.register("vehicleType")}>
                {enumOptions("VehicleType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="v-body" label="Тип кузова" required>
              <NativeSelect {...f.register("bodyType")}>
                {enumOptions("BodyType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {vehicle?.status !== "ASSIGNED" && (
              <Field id="v-status" label="Статус">
                <NativeSelect {...f.register("status")}>
                  <option value="AVAILABLE">Свободен</option>
                  <option value="MAINTENANCE">На обслуживании</option>
                  <option value="INACTIVE">Неактивен</option>
                </NativeSelect>
              </Field>
            )}
            <Field id="v-cap" label="Грузоподъёмность, кг" error={e.capacityKg?.message} required>
              <Input type="number" inputMode="decimal" {...f.register("capacityKg")} />
            </Field>
            <Field id="v-vol" label="Объём кузова, м³" error={e.volumeM3?.message}>
              <Input type="number" inputMode="decimal" {...f.register("volumeM3")} />
            </Field>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="v-gps" checked={gpsEnabled} onCheckedChange={(c) => f.setValue("gpsEnabled", c === true)} />
              <Label htmlFor="v-gps">Есть GPS</Label>
            </div>
            <DialogFooter className="sm:col-span-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" loading={f.formState.isSubmitting} loadingText="Сохраняем...">
                {vehicle ? "Сохранить" : "Добавить автомобиль"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddVehicleButton() {
  return (
    <VehicleFormDialog
      trigger={
        <Button>
          <Plus /> Добавить автомобиль
        </Button>
      }
    />
  );
}

export function VehicleRowActions({
  vehicle,
  currentOrder,
  assignableOrders,
}: {
  vehicle: VehicleRow;
  currentOrder: { id: string; publicNumber: string; currentStatus: string } | null;
  assignableOrders: { id: string; publicNumber: string; route: string; weightKg: number }[];
}) {
  const { run, pending } = useAction();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [orderId, setOrderId] = React.useState("");
  const canUnassign = currentOrder && ["VEHICLE_ASSIGNED", "DRIVER_ASSIGNED", "WAITING_FOR_LOADING"].includes(currentOrder.currentStatus);
  const fits = assignableOrders.filter((o) => o.weightKg <= vehicle.capacityKg);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <VehicleFormDialog
        vehicle={vehicle}
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Редактировать ${vehicle.plateNumber}`}>
            <Pencil /> <span className="hidden xl:inline">Редактировать</span>
          </Button>
        }
      />
      {vehicle.status === "AVAILABLE" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAssignOpen(true)}
          disabled={fits.length === 0}
          title={fits.length === 0 ? "Нет перевозок, ожидающих автомобиль" : undefined}
        >
          <Truck /> Назначить
        </Button>
      )}
      {canUnassign && (
        <ConfirmDialog
          title={`Снять ${vehicle.plateNumber} с рейса ${currentOrder!.publicNumber}?`}
          description="Автомобиль станет свободным; если назначен водитель — он тоже будет снят."
          destructive
          confirmLabel="Снять с рейса"
          onConfirm={async () =>
            (await run(() => api(`/api/orders/${currentOrder!.id}/vehicle`, { method: "DELETE" }), {
              success: "Автомобиль снят с рейса",
            })) !== undefined
          }
          trigger={
            <Button variant="ghost" size="sm">
              <Unlink /> Снять с рейса
            </Button>
          }
        />
      )}
      {vehicle.status !== "ASSIGNED" && (
        <ConfirmDialog
          title={`Удалить автомобиль ${vehicle.plateNumber}?`}
          description="Автомобиль будет скрыт из автопарка. История перевозок сохранится."
          irreversible
          destructive
          confirmLabel="Удалить"
          onConfirm={async () =>
            (await run(() => api(`/api/vehicles/${vehicle.id}`, { method: "DELETE" }), { success: "Автомобиль удалён" })) !== undefined
          }
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Удалить ${vehicle.plateNumber}`}>
              <Trash2 className="text-danger" />
            </Button>
          }
        />
      )}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Назначить {vehicle.plateNumber}</DialogTitle>
            <DialogDescription>Перевозки с подписанным договором, ожидающие автомобиль.</DialogDescription>
          </DialogHeader>
          <NativeSelect value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="Перевозка">
            <option value="">Выберите перевозку</option>
            {fits.map((o) => (
              <option key={o.id} value={o.id}>
                {o.publicNumber} · {o.route}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Отмена
            </Button>
            <Button
              disabled={!orderId}
              loading={pending}
              loadingText="Назначаем..."
              onClick={() =>
                run((key) => api(`/api/orders/${orderId}/vehicle`, { body: { vehicleId: vehicle.id }, idempotencyKey: key }), {
                  success: "Автомобиль назначен",
                  onSuccess: () => setAssignOpen(false),
                })
              }
            >
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
