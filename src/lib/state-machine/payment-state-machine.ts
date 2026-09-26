/**
 * Централизованная state machine безопасной сделки (PaymentRecord с type = SECURE_DEAL).
 *
 * Принципы:
 *  - CargoFlow не хранит и не перемещает деньги. Фактическое движение средств выполняет платёжный провайдер
 *    (банк / лицензированный PSP). Статусы RESERVED / RELEASED / REFUNDED выставляются только по результату
 *    операции провайдера (actor = PROVIDER), который приходит в PaymentService.applyProviderResult.
 *  - Ни один HTTP endpoint не принимает «целевой статус» платежа — только бизнес-команды
 *    (оформить сделку, подтвердить получение, открыть спор, решение администратора).
 *  - Модуль не зависит от БД и используется и на сервере, и в UI.
 */
import type { PaymentStatus } from "@/generated/prisma/enums";

export type SecureDealStatus = Extract<PaymentStatus, `PAYMENT_${string}`>;

/** Кто инициирует переход. PROVIDER — подтверждённый результат операции платёжного провайдера. */
export type PaymentActor = "PAYER" | "PAYEE" | "ADMIN" | "SYSTEM" | "PROVIDER";

export const SECURE_DEAL_STATUSES: SecureDealStatus[] = [
  "PAYMENT_PENDING",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_RESERVED",
  "PAYMENT_RELEASE_PENDING",
  "PAYMENT_RELEASED",
  "PAYMENT_PARTIALLY_RELEASED",
  "PAYMENT_REFUNDED",
  "PAYMENT_DISPUTED",
  "PAYMENT_FAILED",
  "PAYMENT_CANCELLED",
];

export const PAYMENT_TRANSITIONS: Record<SecureDealStatus, Partial<Record<SecureDealStatus, PaymentActor[]>>> = {
  PAYMENT_PENDING: {
    PAYMENT_AUTHORIZED: ["PROVIDER"],
    PAYMENT_RESERVED: ["PROVIDER"],
    PAYMENT_FAILED: ["PROVIDER"],
    PAYMENT_CANCELLED: ["PAYER", "ADMIN", "SYSTEM"],
  },
  PAYMENT_AUTHORIZED: {
    PAYMENT_RESERVED: ["PROVIDER"],
    PAYMENT_FAILED: ["PROVIDER"],
    // Отмена авторизации (void) подтверждается провайдером
    PAYMENT_CANCELLED: ["PROVIDER"],
  },
  PAYMENT_RESERVED: {
    // Условия выплаты выполнены (подтверждение получения / истёк срок проверки) или решение администратора
    PAYMENT_RELEASE_PENDING: ["SYSTEM", "ADMIN"],
    PAYMENT_DISPUTED: ["SYSTEM"],
    PAYMENT_REFUNDED: ["PROVIDER"],
    PAYMENT_PARTIALLY_RELEASED: ["PROVIDER"],
    PAYMENT_RELEASED: ["PROVIDER"],
  },
  PAYMENT_RELEASE_PENDING: {
    PAYMENT_RELEASED: ["PROVIDER"],
    PAYMENT_PARTIALLY_RELEASED: ["PROVIDER"],
    // Провайдер отклонил выплату — администратор возвращает средства в резерв для разбирательства
    PAYMENT_RESERVED: ["ADMIN"],
    // …или возвращает их заказчику
    PAYMENT_REFUNDED: ["PROVIDER"],
  },
  PAYMENT_DISPUTED: {
    PAYMENT_RESERVED: ["ADMIN"],
    PAYMENT_RELEASE_PENDING: ["ADMIN"],
    PAYMENT_PARTIALLY_RELEASED: ["PROVIDER"],
    PAYMENT_RELEASED: ["PROVIDER"],
    PAYMENT_REFUNDED: ["PROVIDER"],
  },
  PAYMENT_PARTIALLY_RELEASED: {
    PAYMENT_RELEASE_PENDING: ["SYSTEM", "ADMIN"],
    PAYMENT_DISPUTED: ["SYSTEM"],
    PAYMENT_RELEASED: ["PROVIDER"],
    PAYMENT_REFUNDED: ["PROVIDER"],
  },
  PAYMENT_RELEASED: {},
  PAYMENT_REFUNDED: {},
  PAYMENT_FAILED: {},
  PAYMENT_CANCELLED: {},
};

/** Средства обеспечены и удерживаются у провайдера (ещё не выплачены / не возвращены полностью). */
export const HELD_STATUSES: SecureDealStatus[] = [
  "PAYMENT_RESERVED",
  "PAYMENT_RELEASE_PENDING",
  "PAYMENT_DISPUTED",
  "PAYMENT_PARTIALLY_RELEASED",
];

/** Сделка оформлена, но оплата ещё не обеспечена. */
export const UNSECURED_STATUSES: SecureDealStatus[] = ["PAYMENT_PENDING", "PAYMENT_AUTHORIZED"];

export const FINAL_PAYMENT_STATUSES: SecureDealStatus[] = ["PAYMENT_RELEASED", "PAYMENT_REFUNDED", "PAYMENT_FAILED", "PAYMENT_CANCELLED"];

/** Действующая (не отменённая и не проваленная) сделка. */
export const LIVE_STATUSES: SecureDealStatus[] = SECURE_DEAL_STATUSES.filter((s) => s !== "PAYMENT_CANCELLED" && s !== "PAYMENT_FAILED");

export function isSecureDealStatus(s: string): s is SecureDealStatus {
  return (SECURE_DEAL_STATUSES as string[]).includes(s);
}

export type PaymentTransitionCheck = { ok: true } | { ok: false; reason: string };

export function canPaymentTransition(from: SecureDealStatus, to: SecureDealStatus, actor: PaymentActor): PaymentTransitionCheck {
  if (from === to) return { ok: false, reason: `Платёж уже в статусе «${PAYMENT_STATUS_LABELS[to]}».` };
  if (FINAL_PAYMENT_STATUSES.includes(from)) {
    return { ok: false, reason: `Платёж в финальном статусе «${PAYMENT_STATUS_LABELS[from]}» — изменения невозможны.` };
  }
  const actors = PAYMENT_TRANSITIONS[from]?.[to];
  if (!actors) {
    return { ok: false, reason: `Переход платежа «${PAYMENT_STATUS_LABELS[from]}» → «${PAYMENT_STATUS_LABELS[to]}» недопустим.` };
  }
  if (!actors.includes(actor)) {
    if (to === "PAYMENT_RELEASED" || to === "PAYMENT_REFUNDED" || to === "PAYMENT_RESERVED") {
      return { ok: false, reason: "Этот статус устанавливается только по подтверждению платёжного провайдера." };
    }
    return { ok: false, reason: "Недостаточно прав для изменения статуса платежа." };
  }
  return { ok: true };
}

/** Удерживаемый остаток (минорные единицы → считать в копейках/центах, чтобы избежать ошибок float). */
export function heldMinor(p: { amountMinor: number; releasedMinor: number; refundedMinor: number }) {
  return Math.max(0, p.amountMinor - p.releasedMinor - p.refundedMinor);
}

/**
 * Статус после успешной выплаты/возврата провайдером.
 * Остаток = 0 → RELEASED (если что-то выплачено перевозчику) или REFUNDED (всё возвращено заказчику).
 * Остаток > 0 и что-то выплачено → PARTIALLY_RELEASED (остаток удерживается до решения).
 * Иначе статус не меняется (частичный возврат при сохранении резерва).
 */
export function statusAfterMovement(
  current: SecureDealStatus,
  p: { amountMinor: number; releasedMinor: number; refundedMinor: number },
): SecureDealStatus {
  const held = heldMinor(p);
  if (held === 0) return p.releasedMinor > 0 ? "PAYMENT_RELEASED" : "PAYMENT_REFUNDED";
  if (p.releasedMinor > 0) return "PAYMENT_PARTIALLY_RELEASED";
  return current;
}

export const PAYMENT_STATUS_LABELS: Record<SecureDealStatus, string> = {
  PAYMENT_PENDING: "Ожидает оплаты",
  PAYMENT_AUTHORIZED: "Оплата авторизована",
  PAYMENT_RESERVED: "Оплата обеспечена",
  PAYMENT_RELEASE_PENDING: "Выплата перевозчику в обработке",
  PAYMENT_RELEASED: "Выплачено перевозчику",
  PAYMENT_PARTIALLY_RELEASED: "Выплачено частично",
  PAYMENT_REFUNDED: "Возвращено заказчику",
  PAYMENT_DISPUTED: "Заморожено: спор",
  PAYMENT_FAILED: "Ошибка оплаты",
  PAYMENT_CANCELLED: "Отменено",
};

/** Пояснение статуса для участников сделки. */
export const PAYMENT_STATUS_HINTS: Record<SecureDealStatus, string> = {
  PAYMENT_PENDING: "Заказчик оформил безопасную сделку. Ожидается подтверждение оплаты платёжным провайдером.",
  PAYMENT_AUTHORIZED: "Платёж авторизован провайдером и ожидает резервирования.",
  PAYMENT_RESERVED: "Сумма обеспечена у платёжного провайдера. Перевозчику она будет выплачена после выполнения условий сделки.",
  PAYMENT_RELEASE_PENDING: "Условия выполнены. Выплата перевозчику передана платёжному провайдеру и ожидает подтверждения.",
  PAYMENT_RELEASED: "Средства выплачены перевозчику (за вычетом комиссии платформы).",
  PAYMENT_PARTIALLY_RELEASED: "Часть суммы выплачена перевозчику, остаток удерживается до решения.",
  PAYMENT_REFUNDED: "Средства возвращены заказчику.",
  PAYMENT_DISPUTED: "По перевозке открыт спор. Выплата заморожена до решения администратора.",
  PAYMENT_FAILED: "Платёжный провайдер отклонил операцию. Оформите сделку заново или обратитесь в поддержку.",
  PAYMENT_CANCELLED: "Безопасная сделка отменена, средства не резервировались или резерв снят.",
};
