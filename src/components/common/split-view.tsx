"use client";
import { ChevronLeft } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Колонки как в Mail: список слева, справа — карта и детали выбранного объекта.
 * Пока ничего не выбрано, справа обзорная карта. На телефоне — карта сверху и список,
 * выбранный объект открывается «переходом» с кнопкой «Назад» поверх карты.
 */
export function SplitView({
  list,
  map,
  detail,
  hasDetail,
  onBack,
  backLabel,
  listLabel,
  testId,
}: {
  list: React.ReactNode;
  map: React.ReactNode;
  detail?: React.ReactNode;
  hasDetail: boolean;
  onBack: () => void;
  backLabel: string;
  listLabel: string;
  testId?: string;
}) {
  return (
    <div className="relative flex h-full flex-col lg:flex-row" data-testid={testId}>
      <section
        aria-label={listLabel}
        className={cn(
          "bg-card lg:hairline-r flex min-h-0 flex-col max-lg:order-2 lg:w-[22rem] lg:shrink-0",
          hasDetail ? "max-lg:hidden" : "max-lg:flex-1",
        )}
      >
        {list}
      </section>
      <div className={cn("flex min-h-0 flex-col max-lg:order-1 lg:flex-1", hasDetail ? "flex-1" : "max-lg:h-[34%] max-lg:shrink-0")}>
        <div
          className={cn(
            "relative min-h-0 shrink-0 transition-[height] duration-(--duration-complex) ease-out motion-reduce:transition-none",
            hasDetail ? "h-[36%] lg:h-[44%] lg:min-h-64" : "h-full",
          )}
        >
          {map}
          {hasDetail && (
            <button
              type="button"
              onClick={onBack}
              className="material-menu shadow-menu text-link text-body absolute top-3 left-3 z-[3] inline-flex h-9 items-center gap-0.5 rounded-full pr-3.5 pl-2 font-medium lg:hidden"
            >
              <ChevronLeft className="size-5 [stroke-width:2.25]" aria-hidden />
              {backLabel}
            </button>
          )}
        </div>
        {hasDetail && <div className="animate-fade-in bg-background min-h-0 flex-1">{detail}</div>}
      </div>
    </div>
  );
}
