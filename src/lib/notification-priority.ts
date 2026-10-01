/**
 * Приоритет события в операционном центре уведомлений (только для отображения; на доставку не влияет).
 * critical — спор, несоответствие топлива, сбой оплаты; action — нужно действие пользователя; info — для сведения.
 */
export type EventPriority = "critical" | "action" | "info";

const CRITICAL = new Set(["DISPUTE_CREATED", "DISPUTE_UPDATED", "FUEL_ANOMALY"]);
const ACTION = new Set(["NEW_BID", "BID_COUNTERED", "CONTRACT_READY", "LOAD_QUESTION", "NEW_DOCUMENT", "VERIFICATION_UPDATED"]);
// Начало слова: \b в JS не работает с кириллицей («транспорт» не должен совпадать со «спор»)
const W = "(?:^|[^а-яё])";
const URGENT_WORDS = new RegExp(`${W}(?:задерж|опазд|просроч|не удал|ошибк|отклон|спор|истека)`, "i");
const ACTION_WORDS = new RegExp(`${W}(?:подтверд|подпиш|требует|выберите|ожидает вашего)`, "i");

export function eventPriority(type: string, title: string, body?: string | null): EventPriority {
  const text = `${title} ${body ?? ""}`;
  if (CRITICAL.has(type) || URGENT_WORDS.test(text)) return "critical";
  if (type === "PAYMENT_UPDATED" && /не прош|ошибк|возврат/i.test(text)) return "critical";
  if (ACTION.has(type) || ACTION_WORDS.test(text)) return "action";
  return "info";
}

/** Объект, к которому относится событие, — по ссылке уведомления. */
export function eventObject(link: string | null): { kind: string; action: string } | null {
  if (!link) return null;
  if (link.startsWith("/orders/"))
    return { kind: "Перевозка", action: link.includes("tab=documents") ? "Открыть документы" : "Открыть перевозку" };
  if (link.startsWith("/loads/")) return { kind: "Груз", action: link.includes("tab=bids") ? "Смотреть предложения" : "Открыть груз" };
  if (link.startsWith("/fuel")) return { kind: "Топливо", action: "Открыть проверку" };
  if (link.startsWith("/company") || link.startsWith("/companies")) return { kind: "Компания", action: "Открыть компанию" };
  if (link.startsWith("/next-load")) return { kind: "Следующий рейс", action: "Смотреть грузы" };
  if (link.startsWith("/admin")) return { kind: "Администрирование", action: "Открыть" };
  return { kind: "Раздел", action: "Открыть" };
}
