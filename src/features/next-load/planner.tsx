"use client";
import { CircleHelp, MapPin, Plus, RotateCcw, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Field } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { COUNTRIES } from "@/lib/geo/countries";
import { cn } from "@/lib/utils";
import { MapView } from "@/features/tracking/map-view";

export type KnownCity = { country: string; city: string; latitude: number; longitude: number };

type Destination = { country?: string; city?: string; latitude?: number; longitude?: number; label: string };

export type PlannerVehicle = {
  id: string;
  plateNumber: string;
  situation: {
    phase: "IN_TRIP" | "DELIVERED" | "FREE";
    freePoint: { lat: number; lng: number; label: string; city: string | null; country: string | null; source: string } | null;
    returnPoint: { lat: number; lng: number; city: string; country: string } | null;
  };
};

/** Популярные направления коридора Китай — Центральная Азия — Россия. */
const QUICK = ["Астана", "Москва", "Челябинск", "Екатеринбург", "Бишкек", "Ташкент", "Новосибирск", "Шымкент", "Урумчи"];

function nearest(cities: KnownCity[], lat: number, lng: number) {
  let best: KnownCity | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const d = (c.latitude - lat) ** 2 + ((c.longitude - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // ≈ 0.5° ~ 50 км
  return best && Math.sqrt(bestD) < 0.5 ? best : null;
}

export function NextLoadPlanner({
  vehicle,
  cities,
  initial,
}: {
  vehicle: PlannerVehicle | null;
  cities: KnownCity[];
  initial?: { allowedDeviationKm: number; maxPickupDistanceKm: number } | null;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const free = vehicle?.situation.freePoint ?? null;
  const ret = vehicle?.situation.returnPoint ?? null;
  const [mode, setMode] = React.useState<"RETURN" | "PICK" | "UNDECIDED">("PICK");
  const [dests, setDests] = React.useState<Destination[]>([]);
  const [originCity, setOriginCity] = React.useState<{ country: string; city: string } | null>(
    free ? null : { country: "KZ", city: "Алматы" },
  );
  const [editOrigin, setEditOrigin] = React.useState(!free);
  const [deviation, setDeviation] = React.useState(String(initial?.allowedDeviationKm ?? 250));
  const [radius, setRadius] = React.useState(String(initial?.maxPickupDistanceKm ?? 300));
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [otherCountry, setOtherCountry] = React.useState("RU");
  const [otherCity, setOtherCity] = React.useState("");
  const [mapOpen, setMapOpen] = React.useState(false);
  const [mapPoint, setMapPoint] = React.useState<{ lat: number; lng: number } | null>(null);

  const currentCity = (originCity?.city ?? free?.city ?? "").toLowerCase();
  const quick = cities.filter((c) => QUICK.includes(c.city) && c.city.toLowerCase() !== currentCity && c.city !== ret?.city);
  const seen = new Set<string>();
  const quickUnique = quick.filter((c) => (seen.has(c.city) ? false : (seen.add(c.city), true)));
  const has = (city: string) => dests.some((d) => d.city === city);

  const toggleCity = (c: { country: string; city: string }) => {
    setMode("PICK");
    setDests((d) =>
      d.some((x) => x.city === c.city)
        ? d.filter((x) => x.city !== c.city)
        : [...d, { country: c.country, city: c.city, label: c.city }].slice(0, 5),
    );
  };

  const addMapPoint = () => {
    if (!mapPoint) return;
    const near = nearest(cities, mapPoint.lat, mapPoint.lng);
    setMode("PICK");
    setDests((d) =>
      [
        ...d,
        {
          latitude: mapPoint.lat,
          longitude: mapPoint.lng,
          label: near ? `≈ ${near.city}` : `${mapPoint.lat.toFixed(2)}, ${mapPoint.lng.toFixed(2)}`,
        },
      ].slice(0, 5),
    );
    setMapPoint(null);
    setMapOpen(false);
  };

  const canSubmit = mode === "RETURN" || mode === "UNDECIDED" || dests.length > 0;
  const submit = () => {
    const intent =
      mode === "RETURN" ? "RETURN" : mode === "UNDECIDED" ? "UNDECIDED" : dests.some((d) => d.latitude != null) ? "DIRECTION" : "CITY";
    return run(
      (key) =>
        api<{ movement: { id: string } }>("/api/next-load/movements", {
          body: {
            vehicleId: vehicle?.id ?? null,
            intent,
            origin: editOrigin && originCity ? originCity : null,
            destinations:
              mode === "PICK"
                ? dests.map((d) => ({
                    country: d.country,
                    city: d.city,
                    latitude: d.latitude,
                    longitude: d.longitude,
                    label: d.label.replace(/^≈ /, ""),
                  }))
                : [],
            allowedDeviationKm: Number(deviation),
            maxPickupDistanceKm: Number(radius),
            availableFrom: from || null,
            availableUntil: until || null,
          },
          idempotencyKey: key,
        }),
      {
        success: "План сохранён — подбираем грузы",
        refresh: false,
        onSuccess: (r) => router.push(`/next-load?${vehicle ? `vehicle=${vehicle.id}&` : ""}movement=${r.movement.id}`),
      },
    );
  };

  const choice = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left font-medium transition-colors duration-(--duration-micro)",
      active ? "bg-accent text-link ring-primary/40 ring-1 ring-inset" : "bg-fill-quaternary hover:bg-fill-tertiary",
    );

  return (
    <div className="space-y-4" data-testid="next-load-planner">
      <div className="text-body">
        <p className="text-muted-foreground text-footnote">Текущая точка</p>
        {!editOrigin && free ? (
          <p className="flex flex-wrap items-center gap-2">
            <MapPin className="text-danger size-4" aria-hidden />
            <span className="font-medium">{free.label}</span>
            <span className="text-muted-foreground text-footnote">
              {free.source === "TRACKING" ? "по последней отметке водителя" : "адрес разгрузки текущего рейса"}
            </span>
            <button type="button" className="text-link text-footnote hover:underline" onClick={() => setEditOrigin(true)}>
              изменить
            </button>
          </p>
        ) : (
          <div className="mt-1 grid grid-cols-[110px_1fr] gap-2">
            <NativeSelect
              aria-label="Страна текущей точки"
              value={originCity?.country ?? "KZ"}
              onChange={(e) => setOriginCity({ country: e.target.value, city: "" })}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="Город текущей точки"
              list="nl-origin-cities"
              value={originCity?.city ?? ""}
              onChange={(e) => setOriginCity({ country: originCity?.country ?? "KZ", city: e.target.value })}
              placeholder="Город"
            />
            <datalist id="nl-origin-cities">
              {cities
                .filter((c) => c.country === (originCity?.country ?? "KZ"))
                .map((c) => (
                  <option key={c.city} value={c.city} />
                ))}
            </datalist>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-body font-semibold">Что дальше?</p>
        {ret && (
          <button type="button" className={choice(mode === "RETURN")} onClick={() => setMode("RETURN")} data-testid="nl-return">
            <RotateCcw className="size-4" aria-hidden /> Вернуться в {ret.city}
          </button>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Быстрые направления">
          {quickUnique.map((c) => (
            <button
              type="button"
              key={`${c.country}-${c.city}`}
              onClick={() => toggleCity(c)}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors duration-(--duration-micro)",
                mode === "PICK" && has(c.city) ? "bg-primary text-primary-foreground" : "bg-fill-tertiary hover:bg-fill-secondary",
              )}
              aria-pressed={mode === "PICK" && has(c.city)}
            >
              Ехать в {c.city}
            </button>
          ))}
        </div>
        <button type="button" className={choice(false)} onClick={() => setMapOpen(true)}>
          <MapPin className="size-4" aria-hidden /> Выбрать направление на карте
        </button>
        <div className="grid grid-cols-[110px_1fr_auto] gap-2">
          <NativeSelect aria-label="Страна направления" value={otherCountry} onChange={(e) => setOtherCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </NativeSelect>
          <Input
            list="nl-other-cities"
            aria-label="Другой город"
            placeholder="Другой город"
            value={otherCity}
            onChange={(e) => setOtherCity(e.target.value)}
          />
          <datalist id="nl-other-cities">
            {cities
              .filter((c) => c.country === otherCountry)
              .map((c) => (
                <option key={c.city} value={c.city} />
              ))}
          </datalist>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Добавить город"
            disabled={!otherCity.trim()}
            onClick={() => {
              toggleCity({ country: otherCountry, city: otherCity.trim() });
              setOtherCity("");
            }}
          >
            <Plus />
          </Button>
        </div>
        <button type="button" className={choice(mode === "UNDECIDED")} onClick={() => setMode("UNDECIDED")} data-testid="nl-undecided">
          <CircleHelp className="size-4" aria-hidden /> Пока не определился — показать грузы рядом
        </button>
      </div>

      {mode === "PICK" && dests.length > 0 && (
        <div>
          <p className="text-muted-foreground text-footnote mb-1">Направления (можно несколько)</p>
          <div className="flex flex-wrap gap-1.5">
            {dests.map((d, i) => (
              <Badge key={`${d.label}-${i}`} tone="info" className="gap-1 pr-1">
                {d.label}
                <button type="button" aria-label={`Убрать ${d.label}`} onClick={() => setDests(dests.filter((_, j) => j !== i))}>
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <details className="text-body">
        <summary className="text-link cursor-pointer">Параметры поиска</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field id="nl-dev" label="Допустимый крюк, км" hint="Сколько лишних км готовы проехать ради груза по пути">
            <Input type="number" min={10} max={1000} value={deviation} onChange={(e) => setDeviation(e.target.value)} />
          </Field>
          <Field id="nl-radius" label="Радиус поиска, км" hint="Если направление не выбрано">
            <Input type="number" min={10} max={2000} value={radius} onChange={(e) => setRadius(e.target.value)} />
          </Field>
          <Field id="nl-from" label="Свободен с">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field id="nl-until" label="Готов ждать до">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      </details>

      <Button
        size="lg"
        className="w-full"
        disabled={!canSubmit || (editOrigin && !originCity?.city)}
        loading={pending}
        loadingText="Подбираем..."
        onClick={submit}
        data-testid="nl-submit"
      >
        <Search /> Найти подходящие грузы
      </Button>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Направление на карте</DialogTitle>
            <DialogDescription>Нажмите на карту в той стороне, куда планируете ехать. Система подберёт грузы по пути.</DialogDescription>
          </DialogHeader>
          <MapView
            className="h-[380px] w-full overflow-hidden rounded-lg"
            points={[
              ...(free ? [{ lat: free.lat, lng: free.lng, label: `Сейчас: ${free.label}`, kind: "VEHICLE" as const }] : []),
              ...(mapPoint ? [{ ...mapPoint, label: "Выбранная точка", kind: "TARGET" as const }] : []),
            ]}
            lines={
              free && mapPoint
                ? [
                    {
                      coordinates: [
                        [free.lng, free.lat],
                        [mapPoint.lng, mapPoint.lat],
                      ],
                      color: "#ff9500",
                      dashed: true,
                    },
                  ]
                : []
            }
            onPick={setMapPoint}
            pickHint="Кликните, чтобы выбрать точку"
          />
          <DialogFooter>
            <p className="text-muted-foreground text-body mr-auto self-center">
              {mapPoint ? `Выбрано: ${mapPoint.lat.toFixed(2)}, ${mapPoint.lng.toFixed(2)}` : "Точка не выбрана"}
            </p>
            <Button variant="outline" onClick={() => setMapOpen(false)}>
              Отмена
            </Button>
            <Button disabled={!mapPoint} onClick={addMapPoint}>
              Добавить направление
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CancelPlanButton({ movementId, vehicleId }: { movementId: string; vehicleId: string | null }) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        run(() => api(`/api/next-load/movements/${movementId}/cancel`, { method: "POST" }), {
          success: "План отменён",
          refresh: false,
          onSuccess: () => router.push(vehicleId ? `/next-load?vehicle=${vehicleId}` : "/next-load"),
        })
      }
    >
      Отменить план
    </Button>
  );
}
