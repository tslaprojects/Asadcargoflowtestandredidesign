import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { orderProgress } from "@/lib/state-machine/order-progress";

const h = (...s: OrderStatus[]) => s.map((toStatus) => ({ toStatus }));
const PREP: OrderStatus[] = ["CARRIER_SELECTED", "CONTRACT_PENDING", "CONTRACT_SIGNED", "VEHICLE_ASSIGNED", "DRIVER_ASSIGNED"];
const stateOf = (p: ReturnType<typeof orderProgress>, key: string) => p.steps.find((s) => s.key === key)?.state;

describe("orderProgress", () => {
  it("обычное движение: текущий этап — текущий статус, всё до него пройдено", () => {
    const p = orderProgress(h(...PREP, "AT_LOADING", "LOADED", "IN_TRANSIT"), "IN_TRANSIT");
    expect(p.steps[p.currentIndex].key).toBe("transit");
    expect(stateOf(p, "loaded")).toBe("done");
    expect(stateOf(p, "border")).toBe("todo");
    expect(p.phase).toBe("TRANSIT");
    expect(p.currentNote).toBeNull();
    expect(p.nextLabel).toBe("Граница");
  });

  it("IN_TRANSIT после таможни: граница и таможня пройдены, текущий — следующий этап «в пути»", () => {
    const p = orderProgress(
      h(...PREP, "AT_LOADING", "LOADED", "IN_TRANSIT", "AT_BORDER", "CUSTOMS", "BORDER_CLEARED", "IN_TRANSIT"),
      "IN_TRANSIT",
    );
    expect(stateOf(p, "border")).toBe("done");
    expect(stateOf(p, "customs")).toBe("done");
    expect(stateOf(p, "transit")).toBe("done");
    expect(p.steps[p.currentIndex].key).toBe("delivery");
    expect(p.currentNote).toBe("в пути");
    // ни одного пройденного этапа после текущего
    expect(p.steps.slice(p.currentIndex + 1).every((s) => s.state === "todo")).toBe(true);
  });

  it("договор ожидает подписи — текущий этап «Договор подписан»", () => {
    const p = orderProgress(h("CARRIER_SELECTED", "CONTRACT_PENDING"), "CONTRACT_PENDING");
    expect(p.steps[p.currentIndex].key).toBe("contract");
    expect(p.phase).toBe("PREPARATION");
  });

  it("спор: этап по последнему рабочему статусу, фаза «Приостановлена»", () => {
    const p = orderProgress(h(...PREP, "AT_LOADING", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "DISPUTED"), "DISPUTED");
    expect(p.steps[p.currentIndex].key).toBe("delivered");
    expect(p.phase).toBe("PAUSED");
  });

  it("закрыта — 100 %, все этапы пройдены", () => {
    const p = orderProgress(h(...PREP, "DELIVERED", "CLOSED"), "CLOSED");
    expect(p.percent).toBe(100);
    expect(p.currentIndex).toBe(-1);
    expect(p.steps.every((s) => s.state === "done")).toBe(true);
  });

  it("отменена — пройденное остаётся, остальное не начато", () => {
    const p = orderProgress(h("CARRIER_SELECTED", "CONTRACT_PENDING", "CONTRACT_SIGNED", "CANCELLED"), "CANCELLED");
    expect(p.phase).toBe("CANCELLED");
    expect(stateOf(p, "contract")).toBe("done");
    expect(stateOf(p, "vehicle")).toBe("todo");
  });

  it("процент растёт монотонно по основному пути", () => {
    const path: OrderStatus[] = [...PREP, "AT_LOADING", "LOADED", "IN_TRANSIT", "AT_BORDER", "CUSTOMS", "AT_DELIVERY", "DELIVERED"];
    let prev = -1;
    for (let i = 0; i < path.length; i++) {
      const p = orderProgress(h(...path.slice(0, i + 1)), path[i]);
      expect(p.percent).toBeGreaterThanOrEqual(prev);
      prev = p.percent;
    }
  });
});
