/**
 * Централизованная state machine перевозки (TransportOrder).
 *
 * Здесь и только здесь определены:
 *  - разрешённые переходы статусов;
 *  - кто (какая сторона сделки) может выполнять переход;
 *  - какие переходы доступны «вручную» через общий endpoint смены статуса,
 *    а какие выполняются только системой внутри специализированных операций
 *    (подписание договора, назначение транспорта, открытие спора и т.д.);
 *  - человекочитаемые подписи и действия для водителя.
 *
 * Модуль не зависит от БД — выполнение перехода (performTransition) находится в OrderService.
 */
import type { OrderStatus, TrackingEventType } from "@/generated/prisma/enums";

export type ActorSide = "CUSTOMER" | "CARRIER" | "DRIVER" | "ADMIN" | "SYSTEM";

type TransitionRule = {
  /** Кто может инициировать переход. */
  actors: ActorSide[];
  /** true — переход доступен через общий endpoint POST /api/orders/:id/status. */
  manual: boolean;
  /** Требуется подтверждение в UI. */
  confirm?: boolean;
};

const DRIVER_OPS: ActorSide[] = ["DRIVER", "CARRIER", "ADMIN"];

/** Статусы, в которых сделка считается активной (есть обязательства сторон). */
export const ACTIVE_STATUSES: OrderStatus[] = [
  "CARRIER_SELECTED",
  "CONTRACT_PENDING",
  "CONTRACT_SIGNED",
  "VEHICLE_ASSIGNED",
  "DRIVER_ASSIGNED",
  "WAITING_FOR_LOADING",
  "AT_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CUSTOMS",
  "BORDER_CLEARED",
  "AT_DELIVERY",
  "DELIVERED",
];

/** Статусы, в которых груз физически перемещается / у водителя идёт рейс. */
export const TRIP_STATUSES: OrderStatus[] = [
  "WAITING_FOR_LOADING",
  "AT_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CUSTOMS",
  "BORDER_CLEARED",
  "AT_DELIVERY",
];

/** Статусы «в пути» для KPI. */
export const IN_TRANSIT_STATUSES: OrderStatus[] = ["IN_TRANSIT", "AT_BORDER", "CUSTOMS", "BORDER_CLEARED", "AT_DELIVERY", "LOADED"];

/** До подписания договора стороны могут отменить сделку самостоятельно. */
export const SELF_CANCELLABLE_STATUSES: OrderStatus[] = ["CARRIER_SELECTED", "CONTRACT_PENDING"];

/** Статусы, из которых можно открыть спор. */
export const DISPUTABLE_STATUSES: OrderStatus[] = ACTIVE_STATUSES.filter((s) => s !== "CARRIER_SELECTED");

/** Статусы, при которых автомобиль/водитель заняты заказом. */
export const RESOURCE_BUSY_STATUSES: OrderStatus[] = [
  "VEHICLE_ASSIGNED",
  "DRIVER_ASSIGNED",
  "WAITING_FOR_LOADING",
  "AT_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CUSTOMS",
  "BORDER_CLEARED",
  "AT_DELIVERY",
  "DISPUTED",
  "ON_HOLD",
];

/** До какого момента можно снять автомобиль/водителя с рейса. */
export const UNASSIGNABLE_STATUSES: OrderStatus[] = ["VEHICLE_ASSIGNED", "DRIVER_ASSIGNED", "WAITING_FOR_LOADING"];

export const FINAL_STATUSES: OrderStatus[] = ["CLOSED", "CANCELLED"];

const cancelByParties: TransitionRule = { actors: ["CUSTOMER", "CARRIER", "ADMIN"], manual: true, confirm: true };
const cancelByAdmin: TransitionRule = { actors: ["ADMIN"], manual: true, confirm: true };
const dispute: TransitionRule = { actors: ["CUSTOMER", "CARRIER", "ADMIN"], manual: false };
const hold: TransitionRule = { actors: ["ADMIN"], manual: true, confirm: true };
const system: TransitionRule = { actors: ["SYSTEM"], manual: false };
/** Переходы назначения/снятия ресурсов выполняет перевозчик через отдельные операции. */
const assignment: TransitionRule = { actors: ["CARRIER", "ADMIN", "SYSTEM"], manual: false };

/**
 * Примечания к модели статусов:
 *  - DRAFT / PUBLISHED / CARRIER_SELECTION — статусы груза до сделки; перевозка создаётся сразу в CARRIER_SELECTED
 *    (принятие ставки), поэтому для перевозки они недостижимы и оставлены в enum для совместимости данных;
 *  - DRIVER_ASSIGNED — промежуточный: назначение водителя сразу передаёт рейс водителю (WAITING_FOR_LOADING).
 *    Ручной переход DRIVER_ASSIGNED → WAITING_FOR_LOADING оставлен для перевозок, остановленных в DRIVER_ASSIGNED
 *    (например, после возобновления из паузы).
 */
export const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, TransitionRule>>> = {
  DRAFT: { PUBLISHED: system },
  PUBLISHED: { CARRIER_SELECTION: system, CANCELLED: cancelByParties },
  CARRIER_SELECTION: { CARRIER_SELECTED: system, CANCELLED: cancelByParties },
  CARRIER_SELECTED: { CONTRACT_PENDING: system, CANCELLED: cancelByParties },
  CONTRACT_PENDING: {
    CONTRACT_SIGNED: system,
    CANCELLED: cancelByParties,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  CONTRACT_SIGNED: { VEHICLE_ASSIGNED: assignment, CANCELLED: cancelByAdmin, DISPUTED: dispute, ON_HOLD: hold },
  VEHICLE_ASSIGNED: {
    DRIVER_ASSIGNED: assignment,
    CONTRACT_SIGNED: assignment,
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  DRIVER_ASSIGNED: {
    WAITING_FOR_LOADING: { actors: ["CARRIER", "ADMIN", "SYSTEM"], manual: true },
    VEHICLE_ASSIGNED: assignment,
    CONTRACT_SIGNED: assignment,
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  WAITING_FOR_LOADING: {
    AT_LOADING: { actors: DRIVER_OPS, manual: true, confirm: true },
    VEHICLE_ASSIGNED: assignment,
    CONTRACT_SIGNED: assignment,
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  AT_LOADING: {
    LOADED: { actors: DRIVER_OPS, manual: true, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  LOADED: {
    IN_TRANSIT: { actors: DRIVER_OPS, manual: true, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  IN_TRANSIT: {
    AT_BORDER: { actors: DRIVER_OPS, manual: true, confirm: true },
    AT_DELIVERY: { actors: DRIVER_OPS, manual: true, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  AT_BORDER: {
    CUSTOMS: { actors: DRIVER_OPS, manual: true, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  CUSTOMS: {
    BORDER_CLEARED: { actors: DRIVER_OPS, manual: true, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  BORDER_CLEARED: {
    IN_TRANSIT: { actors: DRIVER_OPS, manual: true, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  AT_DELIVERY: {
    // Доставка выполняется отдельной операцией (с фото/POD) — не через общий endpoint
    DELIVERED: { actors: DRIVER_OPS, manual: false, confirm: true },
    CANCELLED: cancelByAdmin,
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  DELIVERED: {
    // Закрытие — через подтверждение получения заказчиком; при безопасной сделке —
    // системой после подтверждения выплаты перевозчику платёжным провайдером
    CLOSED: { actors: ["CUSTOMER", "ADMIN", "SYSTEM"], manual: false, confirm: true },
    DISPUTED: dispute,
    ON_HOLD: hold,
  },
  CLOSED: {},
  CANCELLED: {},
  // Выход из спора/паузы — только администратор (возврат в предыдущий статус выполняется отдельно)
  DISPUTED: { CANCELLED: cancelByAdmin, CLOSED: { actors: ["ADMIN"], manual: false } },
  ON_HOLD: { CANCELLED: cancelByAdmin },
};

/** Статусы, в которые администратор может вернуть заказ из DISPUTED / ON_HOLD. */
export const RESUMABLE_STATUSES: OrderStatus[] = ACTIVE_STATUSES;

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function getTransitionRule(from: OrderStatus, to: OrderStatus): TransitionRule | undefined {
  return TRANSITIONS[from]?.[to];
}

/**
 * Проверка перехода.
 * @param opts.manual — переход запрошен через общий endpoint (разрешены только manual-переходы)
 * @param opts.previousStatus — для возврата из DISPUTED/ON_HOLD
 */
export function canTransition(
  current: OrderStatus,
  next: OrderStatus,
  actor: ActorSide,
  opts: { manual?: boolean; previousStatus?: OrderStatus | null } = {},
): TransitionCheck {
  if (current === next) return { ok: false, reason: "Заказ уже находится в этом статусе." };
  if (current === "CLOSED") return { ok: false, reason: "Перевозка уже закрыта." };
  if (current === "CANCELLED") return { ok: false, reason: "Перевозка отменена." };

  // Возобновление после спора/паузы
  if ((current === "DISPUTED" || current === "ON_HOLD") && opts.previousStatus && next === opts.previousStatus) {
    return actor === "ADMIN" || actor === "SYSTEM"
      ? { ok: true }
      : { ok: false, reason: "Возобновить перевозку может только администратор." };
  }

  const rule = getTransitionRule(current, next);
  if (!rule) {
    if (next === "CANCELLED" && !SELF_CANCELLABLE_STATUSES.includes(current)) {
      return {
        ok: false,
        reason: "После подписания договора отмена выполняется через процедуру спора/администратора.",
      };
    }
    return {
      ok: false,
      reason: `Переход «${ORDER_STATUS_LABELS[current]}» → «${ORDER_STATUS_LABELS[next]}» недопустим.`,
    };
  }
  if (opts.manual && !rule.manual) {
    return { ok: false, reason: "Этот переход выполняется отдельной операцией, а не прямой сменой статуса." };
  }
  if (!rule.actors.includes(actor)) {
    if (next === "CANCELLED") {
      return {
        ok: false,
        reason: "После подписания договора отмена выполняется через процедуру спора/администратора.",
      };
    }
    return { ok: false, reason: "У вас нет прав на этот переход статуса." };
  }
  return { ok: true };
}

/** Список следующих статусов, доступных стороне (для UI). */
export function availableTransitions(current: OrderStatus, actor: ActorSide, opts: { manualOnly?: boolean } = {}): OrderStatus[] {
  const rules = TRANSITIONS[current] ?? {};
  return (Object.keys(rules) as OrderStatus[]).filter((to) => {
    const r = rules[to]!;
    if (opts.manualOnly && !r.manual) return false;
    return r.actors.includes(actor);
  });
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликован",
  CARRIER_SELECTION: "Выбор перевозчика",
  CARRIER_SELECTED: "Перевозчик выбран",
  CONTRACT_PENDING: "Ожидает подписания",
  CONTRACT_SIGNED: "Договор подписан",
  VEHICLE_ASSIGNED: "Автомобиль назначен",
  DRIVER_ASSIGNED: "Водитель назначен",
  WAITING_FOR_LOADING: "Ожидает загрузки",
  AT_LOADING: "На загрузке",
  LOADED: "Загружено",
  IN_TRANSIT: "В пути",
  AT_BORDER: "На границе",
  CUSTOMS: "Таможня",
  BORDER_CLEARED: "Граница пройдена",
  AT_DELIVERY: "На разгрузке",
  DELIVERED: "Доставлено",
  CLOSED: "Закрыто",
  CANCELLED: "Отменено",
  DISPUTED: "Спор",
  ON_HOLD: "Приостановлено",
};

/** Действие (глагол) для кнопки перехода в статус. */
export const TRANSITION_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  WAITING_FOR_LOADING: "Готов к загрузке",
  AT_LOADING: "Я прибыл на загрузку",
  LOADED: "Груз загружен",
  IN_TRANSIT: "Начать перевозку",
  AT_BORDER: "Прибыл на границу",
  CUSTOMS: "Начать таможенное оформление",
  BORDER_CLEARED: "Граница пройдена",
  AT_DELIVERY: "Прибыл на разгрузку",
  DELIVERED: "Груз доставлен",
  CLOSED: "Подтвердить получение",
  CANCELLED: "Отменить перевозку",
  ON_HOLD: "Приостановить",
};

/** Подпись действия зависит также от текущего статуса (BORDER_CLEARED → IN_TRANSIT = «Продолжить маршрут»). */
export function transitionActionLabel(from: OrderStatus, to: OrderStatus): string {
  if (from === "BORDER_CLEARED" && to === "IN_TRANSIT") return "Продолжить маршрут";
  return TRANSITION_ACTION_LABELS[to] ?? ORDER_STATUS_LABELS[to];
}

/** Тип события трекинга, автоматически создаваемого при переходе. */
export const TRANSITION_TRACKING_EVENT: Partial<Record<OrderStatus, TrackingEventType>> = {
  AT_LOADING: "ARRIVED_LOADING",
  LOADED: "LOADED",
  IN_TRANSIT: "DEPARTED",
  AT_BORDER: "BORDER_ARRIVED",
  BORDER_CLEARED: "BORDER_CLEARED",
  AT_DELIVERY: "DELIVERY_ARRIVED",
  DELIVERED: "DELIVERED",
};

export type DriverStep = {
  /** Основное действие: переход в статус или «обновить местоположение». */
  primary: { kind: "transition"; to: OrderStatus; label: string } | { kind: "location"; label: string } | null;
  secondary: { kind: "transition"; to: OrderStatus; label: string }[];
  hint: string;
};

/** Следующий шаг водителя в зависимости от статуса. Кнопка всегда соответствует текущему состоянию. */
export function driverNextStep(status: OrderStatus): DriverStep {
  const t = (to: OrderStatus) => ({ kind: "transition" as const, to, label: transitionActionLabel(status, to) });
  switch (status) {
    case "VEHICLE_ASSIGNED":
    case "DRIVER_ASSIGNED":
      return { primary: null, secondary: [], hint: "Рейс готовится. Дождитесь подтверждения от диспетчера." };
    case "WAITING_FOR_LOADING":
      return { primary: t("AT_LOADING"), secondary: [], hint: "Езжайте на место загрузки. По прибытии нажмите кнопку." };
    case "AT_LOADING":
      return { primary: t("LOADED"), secondary: [], hint: "Проверьте груз, сделайте фото груза и пломбы." };
    case "LOADED":
      return { primary: t("IN_TRANSIT"), secondary: [], hint: "Груз загружен. Можно выезжать." };
    case "IN_TRANSIT":
      return {
        primary: { kind: "location", label: "Обновить местоположение" },
        secondary: [t("AT_BORDER"), t("AT_DELIVERY")],
        hint: "Отправляйте местоположение на остановках. Отметьте прибытие на границу или разгрузку.",
      };
    case "AT_BORDER":
      return { primary: t("CUSTOMS"), secondary: [], hint: "Вы на границе. Отметьте начало таможенного оформления." };
    case "CUSTOMS":
      return { primary: t("BORDER_CLEARED"), secondary: [], hint: "Идёт таможенное оформление." };
    case "BORDER_CLEARED":
      return { primary: t("IN_TRANSIT"), secondary: [], hint: "Граница пройдена. Продолжайте маршрут." };
    case "AT_DELIVERY":
      return { primary: t("DELIVERED"), secondary: [], hint: "Выгрузите груз, приложите фото и подписанную CMR." };
    case "DELIVERED":
      return {
        primary: null,
        secondary: [],
        hint: "Груз доставлен. Ожидаем подтверждения получения заказчиком. Укажите, куда планируете ехать дальше.",
      };
    case "CLOSED":
      return { primary: null, secondary: [], hint: "Рейс завершён. Спасибо!" };
    case "DISPUTED":
      return { primary: null, secondary: [], hint: "По перевозке открыт спор. Следуйте указаниям диспетчера." };
    case "ON_HOLD":
      return { primary: null, secondary: [], hint: "Перевозка приостановлена администратором." };
    case "CANCELLED":
      return { primary: null, secondary: [], hint: "Рейс отменён." };
    default:
      return { primary: null, secondary: [], hint: "Рейс ещё не готов к выполнению." };
  }
}

/** Этапы основного timeline на странице заказа. */
export const TIMELINE_STEPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "created", label: "Заявка создана", statuses: [] },
  { key: "carrier", label: "Перевозчик выбран", statuses: ["CARRIER_SELECTED"] },
  { key: "contract", label: "Договор подписан", statuses: ["CONTRACT_SIGNED"] },
  { key: "vehicle", label: "Машина назначена", statuses: ["VEHICLE_ASSIGNED"] },
  { key: "driver", label: "Водитель назначен", statuses: ["DRIVER_ASSIGNED", "WAITING_FOR_LOADING"] },
  { key: "loading", label: "Загрузка", statuses: ["AT_LOADING"] },
  { key: "loaded", label: "Загружено", statuses: ["LOADED"] },
  { key: "transit", label: "В пути", statuses: ["IN_TRANSIT"] },
  { key: "border", label: "Граница", statuses: ["AT_BORDER"] },
  { key: "customs", label: "Таможня", statuses: ["CUSTOMS", "BORDER_CLEARED"] },
  { key: "delivery", label: "Доставка", statuses: ["AT_DELIVERY"] },
  { key: "delivered", label: "Подтверждение", statuses: ["DELIVERED"] },
  { key: "closed", label: "Закрыто", statuses: ["CLOSED"] },
];

/** Порядковый номер статуса по основному пути (для прогресса). */
export const STATUS_ORDER: OrderStatus[] = [
  "CARRIER_SELECTED",
  "CONTRACT_PENDING",
  "CONTRACT_SIGNED",
  "VEHICLE_ASSIGNED",
  "DRIVER_ASSIGNED",
  "WAITING_FOR_LOADING",
  "AT_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_BORDER",
  "CUSTOMS",
  "BORDER_CLEARED",
  "AT_DELIVERY",
  "DELIVERED",
  "CLOSED",
];

export function isActive(status: OrderStatus) {
  return ACTIVE_STATUSES.includes(status);
}
