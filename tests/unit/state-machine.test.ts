import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  canTransition,
  driverNextStep,
  RESOURCE_BUSY_STATUSES,
  TRANSITIONS,
} from "@/lib/state-machine/order-state-machine";

describe("order state machine", () => {
  it("разрешает основной путь перевозки водителю", () => {
    const path = [
      ["WAITING_FOR_LOADING", "AT_LOADING"],
      ["AT_LOADING", "LOADED"],
      ["LOADED", "IN_TRANSIT"],
      ["IN_TRANSIT", "AT_BORDER"],
      ["AT_BORDER", "CUSTOMS"],
      ["CUSTOMS", "BORDER_CLEARED"],
      ["BORDER_CLEARED", "IN_TRANSIT"],
      ["IN_TRANSIT", "AT_DELIVERY"],
    ] as const;
    for (const [from, to] of path) {
      expect(canTransition(from, to, "DRIVER", { manual: true })).toEqual({ ok: true });
    }
  });

  it("запрещает произвольный переход статуса", () => {
    const r = canTransition("WAITING_FOR_LOADING", "DELIVERED", "CARRIER", { manual: true });
    expect(r.ok).toBe(false);
  });

  it("не позволяет пропустить таможню", () => {
    expect(canTransition("AT_BORDER", "BORDER_CLEARED", "DRIVER", { manual: true }).ok).toBe(false);
  });

  it("водитель не может подписывать/закрывать/отменять", () => {
    expect(canTransition("DELIVERED", "CLOSED", "DRIVER").ok).toBe(false);
    expect(canTransition("CONTRACT_PENDING", "CANCELLED", "DRIVER").ok).toBe(false);
    expect(canTransition("CONTRACT_PENDING", "CONTRACT_SIGNED", "DRIVER").ok).toBe(false);
  });

  it("заказчик не может менять статусы рейса", () => {
    expect(canTransition("LOADED", "IN_TRANSIT", "CUSTOMER", { manual: true }).ok).toBe(false);
  });

  it("доставка и закрытие недоступны через общий endpoint (manual)", () => {
    expect(canTransition("AT_DELIVERY", "DELIVERED", "DRIVER", { manual: true }).ok).toBe(false);
    expect(canTransition("AT_DELIVERY", "DELIVERED", "DRIVER").ok).toBe(true);
    expect(canTransition("DELIVERED", "CLOSED", "CUSTOMER", { manual: true }).ok).toBe(false);
    expect(canTransition("DELIVERED", "CLOSED", "CUSTOMER").ok).toBe(true);
  });

  it("после подписания договора отмена только администратором", () => {
    const r = canTransition("IN_TRANSIT", "CANCELLED", "CUSTOMER", { manual: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("спора/администратора");
    expect(canTransition("IN_TRANSIT", "CANCELLED", "ADMIN", { manual: true }).ok).toBe(true);
    expect(canTransition("CONTRACT_PENDING", "CANCELLED", "CARRIER", { manual: true }).ok).toBe(true);
  });

  it("возврат из спора — только администратор в предыдущий статус", () => {
    expect(canTransition("DISPUTED", "IN_TRANSIT", "ADMIN", { previousStatus: "IN_TRANSIT" }).ok).toBe(true);
    expect(canTransition("DISPUTED", "IN_TRANSIT", "CUSTOMER", { previousStatus: "IN_TRANSIT" }).ok).toBe(false);
    expect(canTransition("DISPUTED", "AT_DELIVERY", "ADMIN", { previousStatus: "IN_TRANSIT" }).ok).toBe(false);
  });

  it("закрытая перевозка неизменяема", () => {
    for (const to of Object.keys(TRANSITIONS)) {
      expect(canTransition("CLOSED", to as never, "ADMIN").ok).toBe(false);
    }
  });

  it("список ручных переходов для водителя в пути", () => {
    expect(availableTransitions("IN_TRANSIT", "DRIVER", { manualOnly: true }).sort()).toEqual(["AT_BORDER", "AT_DELIVERY"]);
  });

  it("кнопка водителя соответствует статусу", () => {
    expect(driverNextStep("WAITING_FOR_LOADING").primary).toMatchObject({
      kind: "transition",
      to: "AT_LOADING",
      label: "Я прибыл на загрузку",
    });
    expect(driverNextStep("AT_LOADING").primary).toMatchObject({ to: "LOADED", label: "Груз загружен" });
    expect(driverNextStep("LOADED").primary).toMatchObject({ to: "IN_TRANSIT", label: "Начать перевозку" });
    expect(driverNextStep("IN_TRANSIT").primary).toMatchObject({ kind: "location", label: "Обновить местоположение" });
    expect(driverNextStep("BORDER_CLEARED").primary).toMatchObject({ to: "IN_TRANSIT", label: "Продолжить маршрут" });
    expect(driverNextStep("AT_DELIVERY").primary).toMatchObject({ to: "DELIVERED", label: "Груз доставлен" });
    expect(driverNextStep("CLOSED").primary).toBeNull();
  });

  it("DELIVERED не блокирует ресурсы", () => {
    expect(RESOURCE_BUSY_STATUSES).not.toContain("DELIVERED");
    expect(RESOURCE_BUSY_STATUSES).not.toContain("CLOSED");
  });
});
