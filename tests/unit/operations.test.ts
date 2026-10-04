import { describe, expect, it } from "vitest";
import { orderHealth, orderProgress, tripProgress } from "@/lib/operations";
import { journeySteps } from "@/features/operations/journey-timeline";

const now = new Date("2026-10-01T12:00:00Z");
const day = (d: number) => new Date(now.getTime() + d * 86_400_000);

describe("Операционное состояние перевозки", () => {
  it("в пути по графику / прибывает / опаздывает", () => {
    expect(orderHealth("IN_TRANSIT", { deliveryDate: day(3) }, now)).toBe("moving");
    expect(orderHealth("IN_TRANSIT", { deliveryDate: day(0.5) }, now)).toBe("arriving");
    expect(orderHealth("CUSTOMS", { deliveryDate: day(-1) }, now)).toBe("delayed");
    expect(orderHealth("AT_DELIVERY", { deliveryDate: day(-1) }, now)).toBe("arriving");
  });
  it("просроченная загрузка — задержка; документы — ожидание", () => {
    expect(orderHealth("AT_LOADING", { loadingDate: day(-2) }, now)).toBe("delayed");
    expect(orderHealth("CONTRACT_PENDING", {}, now)).toBe("waiting");
  });
  it("спор, доставка, отмена", () => {
    expect(orderHealth("DISPUTED", {}, now)).toBe("attention");
    expect(orderHealth("DELIVERED", {}, now)).toBe("done");
    expect(orderHealth("CANCELLED", {}, now)).toBe("cancelled");
  });
  it("прогресс", () => {
    expect(tripProgress("LOADED")).toBe(0);
    expect(tripProgress("AT_DELIVERY")).toBe(1);
    expect(tripProgress("IN_TRANSIT")).toBeGreaterThan(0);
    expect(orderProgress("CLOSED")).toBe(1);
  });
});

describe("Этапы рейса (journey)", () => {
  const stops = [
    { type: "PICKUP" as const, city: "Алматы" },
    { type: "BORDER" as const, city: "Хоргос" },
    { type: "DELIVERY" as const, city: "Урумчи" },
  ];
  it("на границе: загрузка и отправление выполнены, граница — сейчас, таможня впереди", () => {
    const s = journeySteps("AT_BORDER", stops);
    expect(s.map((x) => [x.key, x.state])).toEqual([
      ["prep", "done"],
      ["pickup", "done"],
      ["departure", "done"],
      ["border", "current"],
      ["customs", "pending"],
      ["delivery", "pending"],
      ["confirm", "pending"],
    ]);
  });
  it("в пути между точками: ближайший этап — «далее»", () => {
    const s = journeySteps("IN_TRANSIT", stops);
    expect(s.find((x) => x.key === "border")?.state).toBe("next");
  });
  it("без границы — этапов границы и таможни нет", () => {
    const s = journeySteps("LOADED", [stops[0], stops[2]]);
    expect(s.map((x) => x.key)).not.toContain("customs");
    expect(s.find((x) => x.key === "departure")?.state).toBe("current");
  });
});
