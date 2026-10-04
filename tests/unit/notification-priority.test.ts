import { describe, expect, it } from "vitest";
import { eventObject, eventPriority } from "@/lib/notification-priority";

describe("Приоритет событий центра уведомлений", () => {
  it("споры и несоответствия топлива — критично", () => {
    expect(eventPriority("DISPUTE_CREATED", "Открыт спор")).toBe("critical");
    expect(eventPriority("FUEL_ANOMALY", "Несоответствие заправки")).toBe("critical");
  });
  it("задержка в тексте — критично даже для системного события", () => {
    expect(eventPriority("SYSTEM", "Изменён ETA · CF-O-000001", "Ожидается задержка доставки")).toBe("critical");
  });
  it("нужно действие пользователя", () => {
    expect(eventPriority("NEW_BID", "Новое предложение")).toBe("action");
    expect(eventPriority("STATUS_CHANGED", "Груз доставлен · CF-O-1 — подтвердите получение")).toBe("action");
  });
  it("«транспорт» не считается «спором»", () => {
    expect(eventPriority("CONTRACT_SIGNED", "Договор подписан", "Перевозчик может назначать транспорт.")).toBe("info");
  });
  it("остальное — для сведения", () => {
    expect(eventPriority("STATUS_CHANGED", "Груз отправлен")).toBe("info");
  });
  it("объект события по ссылке", () => {
    expect(eventObject("/orders/1?tab=documents")).toEqual({ kind: "Перевозка", action: "Открыть документы" });
    expect(eventObject("/loads/1?tab=bids")?.action).toBe("Смотреть предложения");
    expect(eventObject(null)).toBeNull();
  });
});
