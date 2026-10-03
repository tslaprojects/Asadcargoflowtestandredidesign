import { Check } from "lucide-react";
import type { OrderStatus, StopType } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { STATUS_ORDER } from "@/lib/state-machine/order-state-machine";
import { cn } from "@/lib/utils";

type JourneyStop = { type: StopType; city: string; country?: string | null };
type StepState = "done" | "current" | "next" | "pending";
type Step = { key: string; title: string; place?: string; state: StepState; at?: string | null; hint?: string };

const idx = (s: OrderStatus) => STATUS_ORDER.indexOf(s);

/**
 * Этапы рейса из статуса и маршрута: подготовка → загрузка → отправление → [граница → таможня] → разгрузка → получение.
 * Чистая функция — используется и в панели, и на странице перевозки.
 */
export function journeySteps(status: OrderStatus, stops: JourneyStop[], history: { status: OrderStatus; at: string }[] = []): Step[] {
  const pickup = stops.find((s) => s.type === "PICKUP");
  const border = stops.find((s) => s.type === "BORDER");
  const delivery = [...stops].reverse().find((s) => s.type === "DELIVERY");
  const i = idx(status);
  const at = (...s: OrderStatus[]) => history.find((h) => s.includes(h.status))?.at ?? null;
  const state = (doneFrom: OrderStatus, currentIn: OrderStatus[]): StepState =>
    currentIn.includes(status) ? "current" : i >= idx(doneFrom) && i >= 0 ? "done" : "pending";

  const steps: Step[] = [
    {
      key: "prep",
      title: "Подготовка рейса",
      hint: "договор, машина, водитель",
      state: state("WAITING_FOR_LOADING", [
        "CARRIER_SELECTED",
        "CONTRACT_PENDING",
        "CONTRACT_SIGNED",
        "VEHICLE_ASSIGNED",
        "DRIVER_ASSIGNED",
      ]),
      at: at("DRIVER_ASSIGNED", "WAITING_FOR_LOADING"),
    },
    {
      key: "pickup",
      title: "Загрузка",
      place: pickup?.city,
      state: state("LOADED", ["WAITING_FOR_LOADING", "AT_LOADING"]),
      at: at("LOADED"),
    },
    { key: "departure", title: "Отправление", state: state("IN_TRANSIT", ["LOADED"]), at: at("IN_TRANSIT") },
  ];
  if (border) {
    steps.push(
      { key: "border", title: "Граница", place: border.city, state: state("CUSTOMS", ["AT_BORDER"]), at: at("AT_BORDER") },
      { key: "customs", title: "Таможня", state: state("BORDER_CLEARED", ["CUSTOMS"]), at: at("BORDER_CLEARED") },
    );
  }
  steps.push(
    { key: "delivery", title: "Разгрузка", place: delivery?.city, state: state("DELIVERED", ["AT_DELIVERY"]), at: at("AT_DELIVERY") },
    { key: "confirm", title: "Получение подтверждено", state: state("CLOSED", ["DELIVERED"]), at: at("CLOSED") },
  );
  // В пути между точками: ближайший предстоящий этап — «далее»
  if (!steps.some((s) => s.state === "current")) {
    const next = steps.find((s) => s.state === "pending");
    if (next && i > 0) next.state = "next";
  }
  return steps;
}

const STATE_LABEL: Record<StepState, string> = { done: "выполнено", current: "сейчас", next: "далее", pending: "ожидается" };

/** Этапы рейса: пройденные — залитые кружки с галочкой, текущий — кольцо с точкой, предстоящие — пустые. */
export function JourneyTimeline({
  status,
  stops,
  history,
  compact,
  className,
}: {
  status: OrderStatus;
  stops: JourneyStop[];
  history?: { status: OrderStatus; at: string }[];
  compact?: boolean;
  className?: string;
}) {
  const steps = journeySteps(status, stops, history);
  const halted = status === "CANCELLED" || status === "DISPUTED" || status === "ON_HOLD";
  return (
    <ol className={cn("relative", className)} aria-label="Этапы рейса" data-testid="journey-timeline">
      {steps.map((s, n) => {
        const last = n === steps.length - 1;
        return (
          <li key={s.key} className={cn("relative flex gap-3", compact ? "pb-3" : "pb-4", last && "pb-0")}>
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[1.125rem] bottom-0.5 left-[7px] w-0.5 rounded-full",
                  s.state === "done" ? "bg-primary" : "bg-border-strong",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] mt-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-(--duration-complex)",
                s.state === "done" && "bg-primary text-primary-foreground",
                s.state === "current" && (halted ? "border-delayed bg-card border-2" : "border-primary bg-card border-2"),
                s.state === "next" && "border-primary/50 bg-card border-2",
                s.state === "pending" && "border-border-strong bg-card border-2",
              )}
            >
              {s.state === "done" && <Check className="size-2.5 [stroke-width:3.5]" />}
              {s.state === "current" && (
                <span className={cn("size-1.5 rounded-full", halted ? "bg-delayed" : "bg-primary text-link animate-live-pulse")} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn(s.state === "pending" && "text-muted-foreground", s.state === "current" && "font-semibold")}>
                {s.title}
                {s.place && <span className="text-muted-foreground font-normal"> · {s.place}</span>}
                <span className="sr-only"> — {STATE_LABEL[s.state]}</span>
              </p>
              {!compact && (s.at || s.hint || s.state === "current") && (
                <p className="text-footnote text-muted-foreground num">
                  {s.state === "current" ? (halted ? "остановлено" : "сейчас") : s.at ? formatDateTime(s.at) : s.hint}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
