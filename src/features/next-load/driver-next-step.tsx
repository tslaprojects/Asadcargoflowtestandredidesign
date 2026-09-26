"use client";
import { CircleHelp, Navigation, RotateCcw } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";

const QUICK: { country: string; city: string }[] = [
  { country: "KZ", city: "Астана" },
  { country: "RU", city: "Москва" },
  { country: "RU", city: "Челябинск" },
  { country: "KG", city: "Бишкек" },
  { country: "UZ", city: "Ташкент" },
  { country: "RU", city: "Екатеринбург" },
];

/** Водитель после доставки сообщает, куда планирует ехать дальше — диспетчер получает подходящие грузы. */
export function DriverNextStep({
  orderId,
  deliveryCity,
  returnCity,
  plan,
}: {
  orderId: string;
  deliveryCity: string;
  returnCity: string | null;
  plan: { destinations: string[]; matches: number } | null;
}) {
  const { run, pending } = useAction();
  const send = (body: { intent: string; destinations: { country: string; city: string }[] }) =>
    run(
      (key) =>
        api<{ matchesCount: number }>("/api/next-load/movements", { body: { ...body, sourceOrderId: orderId }, idempotencyKey: key }),
      {
        success: (r) => `Диспетчер получил ваш план. Подходящих грузов: ${r.matchesCount}`,
      },
    );
  const quick = QUICK.filter((c) => c.city !== deliveryCity && c.city !== returnCity);
  return (
    <div className="border-border bg-card space-y-3 rounded-2xl border p-4" data-testid="driver-next-step">
      <p className="flex items-center gap-2 font-semibold">
        <Navigation className="text-primary size-5" aria-hidden /> Что планируете дальше?
      </p>
      <p className="text-muted-foreground text-sm">
        После разгрузки в {deliveryCity} диспетчер подберёт груз по пути — чтобы не ехать порожняком.
      </p>
      {plan && (
        <p className="bg-primary/5 text-primary rounded-lg p-2 text-sm">
          Ваш план: {plan.destinations.length ? plan.destinations.join(", ") : "свободен, грузы рядом"} · подходящих грузов: {plan.matches}
        </p>
      )}
      <div className="grid gap-2">
        {returnCity && (
          <Button size="lg" variant="outline" disabled={pending} onClick={() => send({ intent: "RETURN", destinations: [] })}>
            <RotateCcw /> Вернуться в {returnCity}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {quick.map((c) => (
            <Button key={c.city} size="lg" variant="outline" disabled={pending} onClick={() => send({ intent: "CITY", destinations: [c] })}>
              В {c.city}
            </Button>
          ))}
        </div>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => send({ intent: "UNDECIDED", destinations: [] })}>
          <CircleHelp /> Пока не знаю
        </Button>
      </div>
    </div>
  );
}
