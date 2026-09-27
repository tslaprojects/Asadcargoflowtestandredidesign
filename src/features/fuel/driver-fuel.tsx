"use client";
import { Fuel } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

type Station = { name: string; brand: string; country: string; latitude: number; longitude: number; price: number };

/** Водитель регистрирует заправку по демо-карте. Ответ — «Заправка зарегистрирована» или причина, без финансов компании. */
export function DriverRefuelForm({ stations }: { stations: Station[] }) {
  const [station, setStation] = React.useState(0);
  const [liters, setLiters] = React.useState("");
  const { run, pending } = useAction();
  const st = stations[station];
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          (key) =>
            api<{ approved: boolean; message: string }>("/api/driver/fuel", {
              body: {
                stationName: st.name,
                stationBrand: st.brand,
                stationCountry: st.country,
                latitude: st.latitude,
                longitude: st.longitude,
                fuelType: "DIESEL",
                liters: Number(liters),
                pricePerLiter: st.price,
              },
              idempotencyKey: key,
            }),
          {
            silentError: false,
            onSuccess: (r) => {
              if (r.approved) {
                toast.success(r.message);
                setLiters("");
              } else toast.error(r.message);
            },
          },
        );
      }}
    >
      <Field id="d-st" label="АЗС">
        <NativeSelect value={station} onChange={(e) => setStation(Number(e.target.value))} className="h-12 text-base">
          {stations.map((s, i) => (
            <option key={s.name} value={i}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="d-l" label="Литры">
        <Input
          type="number"
          inputMode="decimal"
          min={1}
          value={liters}
          onChange={(e) => setLiters(e.target.value)}
          className="h-12 text-base"
        />
      </Field>
      <Button
        type="submit"
        size="xl"
        className="w-full"
        disabled={!(Number(liters) > 0)}
        loading={pending}
        loadingText="Отправляем..."
        data-testid="driver-refuel"
      >
        <Fuel /> Зарегистрировать заправку
      </Button>
    </form>
  );
}
