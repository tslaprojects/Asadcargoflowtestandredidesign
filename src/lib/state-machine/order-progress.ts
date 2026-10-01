import type { OrderStatus } from "@/generated/prisma/enums";
import { TIMELINE_STEPS } from "./order-state-machine";

/**
 * Прогресс перевозки для интерфейса (шапка статуса, шкала этапов, списки).
 *
 * Этапы монотонны: пройденным считается всё до самого дальнего этапа, достигнутого по истории статусов.
 * Статусная модель допускает возврат IN_TRANSIT после границы/таможни — в этом случае машина едет
 * к следующей точке, и текущим этапом становится следующий за последним пройденным (с пометкой «в пути»),
 * а не «В пути» перед уже пройденными «Границей» и «Таможней».
 */
export type OrderPhase = "PREPARATION" | "LOADING" | "TRANSIT" | "DELIVERY" | "DONE" | "PAUSED" | "CANCELLED";
export type StepState = "done" | "current" | "todo";

export type ProgressStep = { key: string; label: string; state: StepState; statuses: readonly OrderStatus[] };

export type OrderProgress = {
  steps: ProgressStep[];
  /** Индекс текущего этапа; -1, если перевозка закрыта или отменена. */
  currentIndex: number;
  /** Самый дальний достигнутый этап. */
  reachedIndex: number;
  /** 0–100 — доля пройденного пути по этапам. */
  percent: number;
  phase: OrderPhase;
  /** Уточнение к текущему этапу, например «в пути» при движении между контрольными точками. */
  currentNote: string | null;
  nextLabel: string | null;
};

const PAUSE: OrderStatus[] = ["DISPUTED", "ON_HOLD"];
const EXTRA_STEP_OF: Partial<Record<OrderStatus, string>> = {
  CONTRACT_PENDING: "contract",
  PUBLISHED: "created",
  CARRIER_SELECTION: "created",
  DRAFT: "created",
};

function stepIndexOf(status: OrderStatus): number {
  const byExtra = EXTRA_STEP_OF[status];
  if (byExtra) return TIMELINE_STEPS.findIndex((s) => s.key === byExtra);
  return TIMELINE_STEPS.findIndex((s) => s.statuses.includes(status));
}

function phaseOf(key: string | undefined): OrderPhase {
  switch (key) {
    case "loading":
    case "loaded":
      return "LOADING";
    case "transit":
    case "border":
    case "customs":
      return "TRANSIT";
    case "delivery":
    case "delivered":
      return "DELIVERY";
    case "closed":
      return "DONE";
    default:
      return "PREPARATION";
  }
}

export function orderProgress(history: readonly { toStatus: string }[], current: OrderStatus): OrderProgress {
  const last = TIMELINE_STEPS.length - 1;
  const reachedFromHistory = history.reduce((max, h) => Math.max(max, stepIndexOf(h.toStatus as OrderStatus)), 0);

  const effective: OrderStatus = PAUSE.includes(current)
    ? ((([...history].reverse().find((h) => !PAUSE.includes(h.toStatus as OrderStatus))?.toStatus as OrderStatus | undefined) ??
        "CARRIER_SELECTED") as OrderStatus)
    : current;

  if (current === "CLOSED") {
    return {
      steps: TIMELINE_STEPS.map((s) => ({ key: s.key, label: s.label, state: "done", statuses: s.statuses })),
      currentIndex: -1,
      reachedIndex: last,
      percent: 100,
      phase: "DONE",
      currentNote: null,
      nextLabel: null,
    };
  }

  const effectiveIdx = Math.max(0, stepIndexOf(effective));
  const reachedIndex = Math.max(reachedFromHistory, effectiveIdx);

  if (current === "CANCELLED") {
    return {
      steps: TIMELINE_STEPS.map((s, i) => ({
        key: s.key,
        label: s.label,
        state: i <= reachedIndex ? "done" : "todo",
        statuses: s.statuses,
      })),
      currentIndex: -1,
      reachedIndex,
      percent: Math.round((reachedIndex / last) * 100),
      phase: "CANCELLED",
      currentNote: null,
      nextLabel: null,
    };
  }

  // Возврат на более ранний этап (IN_TRANSIT после таможни) = движение к следующей контрольной точке.
  const movedOn = effectiveIdx < reachedIndex;
  const currentIndex = movedOn ? Math.min(reachedIndex + 1, last) : effectiveIdx;
  const steps = TIMELINE_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    statuses: s.statuses,
    state: (i < currentIndex ? "done" : i === currentIndex ? "current" : "todo") as StepState,
  }));

  return {
    steps,
    currentIndex,
    reachedIndex,
    percent: Math.round((currentIndex / last) * 100),
    phase: PAUSE.includes(current) ? "PAUSED" : phaseOf(TIMELINE_STEPS[currentIndex]?.key),
    currentNote: movedOn && effective === "IN_TRANSIT" ? "в пути" : null,
    nextLabel: TIMELINE_STEPS[currentIndex + 1]?.label ?? null,
  };
}

export const ORDER_PHASE_LABELS: Record<OrderPhase, string> = {
  PREPARATION: "Подготовка",
  LOADING: "Загрузка",
  TRANSIT: "В дороге",
  DELIVERY: "Доставка",
  DONE: "Завершена",
  PAUSED: "Приостановлена",
  CANCELLED: "Отменена",
};
