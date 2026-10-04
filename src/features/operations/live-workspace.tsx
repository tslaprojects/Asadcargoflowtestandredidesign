"use client";
import * as React from "react";
import { SearchField } from "@/components/common/search-field";
import { SplitView } from "@/components/common/split-view";
import { MapWorkspace, type MapObject } from "@/features/tracking/map-workspace";
import type { Health } from "@/lib/operations";
import { cn } from "@/lib/utils";
import type { LiveObject } from "@/server/services/operations.service";
import { OperationalMetric } from "./health";
import { ShipmentDetailPanel } from "./shipment-panel";
import { ShipmentList } from "./shipment-list";

type Filter = "all" | "moving" | "delayed" | "arriving" | "waiting";

const FILTERS: { key: Filter; label: string; health?: Health; match: (h: Health) => boolean }[] = [
  { key: "all", label: "Активно", match: (h) => h !== "done" && h !== "cancelled" },
  { key: "moving", label: "В пути", health: "moving", match: (h) => h === "moving" || h === "arriving" || h === "delayed" },
  { key: "delayed", label: "Задержка", health: "delayed", match: (h) => h === "delayed" },
  { key: "arriving", label: "Прибытие", health: "arriving", match: (h) => h === "arriving" },
  { key: "waiting", label: "Ожидание", health: "waiting", match: (h) => h === "waiting" },
];

export function toMapObject(o: LiveObject): MapObject {
  return {
    id: o.id,
    label: `${o.publicNumber}: ${o.origin} → ${o.destination}, ${o.statusLabel}`,
    health: o.health,
    position: o.position,
    // Маршрут по дорогам, если посчитан; иначе — прямые между точками
    route: o.routeLine ?? o.stops.filter((s) => s.point).map((s) => [s.point!.lng, s.point!.lat] as [number, number]),
  };
}

export type WorkspaceTab = { key: string; label: string; count?: number; content: React.ReactNode };

/** Сегменты в стиле macOS: белый бегунок на сером треке, роль tablist для скринридеров. */
export function SegmentTabs({
  tabs,
  value,
  onChange,
  idPrefix,
  label,
}: {
  tabs: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
  idPrefix: string;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="bg-fill-tertiary flex h-9 scrollbar-none gap-0.5 overflow-x-auto rounded-md p-0.5 lg:h-7"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`${idPrefix}-${t.key}`}
          aria-selected={value === t.key}
          aria-controls={`${idPrefix}-${t.key}-panel`}
          onClick={() => onChange(t.key)}
          className={cn(
            "text-callout lg:text-body flex min-w-0 flex-auto shrink-0 items-center justify-center gap-1 rounded-[0.4375rem] px-2.5 font-medium whitespace-nowrap transition-[background-color,box-shadow,color] duration-(--duration-standard)",
            value === t.key ? "bg-segment-thumb shadow-control text-foreground" : "text-foreground/75 hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="text-footnote text-muted-foreground num">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Перевозки в три колонки: слева — сводка-фильтр, поиск и список; справа — карта и детали выбранной
 * перевозки. Выбор отражается в адресе (?selected=…) — ссылкой можно поделиться; Esc закрывает детали.
 */
export function LiveWorkspace({
  title,
  subtitle,
  actions,
  objects,
  now,
  initialSelected,
  tabs = [],
  empty,
  listFooter,
  metrics = true,
  controls,
  filterInput = true,
  testId = "live-workspace",
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  objects: LiveObject[];
  now: string;
  initialSelected?: string | null;
  /** Дополнительные вкладки списка (внимание, события, рекомендации). */
  tabs?: WorkspaceTab[];
  empty?: React.ReactNode;
  listFooter?: React.ReactNode;
  metrics?: boolean;
  /** Серверные фильтры (URL) под заголовком. */
  controls?: React.ReactNode;
  /** Быстрый поиск по загруженному списку. */
  filterInput?: boolean;
  testId?: string;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelected && objects.some((o) => o.id === initialSelected) ? initialSelected : null,
  );
  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("objects");
  const tabsId = React.useId();

  const select = React.useCallback((id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("selected", id);
    else url.searchParams.delete("selected");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const term = q.trim().toLowerCase();
  const active = FILTERS.find((f) => f.key === filter)!;
  const visible = objects.filter(
    (o) =>
      (filter === "all" ? true : active.match(o.health)) &&
      (!term ||
        [
          o.publicNumber,
          o.origin,
          o.destination,
          o.title,
          o.vehicle?.plateNumber,
          o.driver?.fullName,
          o.carrier.legalName,
          o.shipper.legalName,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(term))),
  );
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const mapObjects = React.useMemo(() => visible.map(toMapObject), [visible]);

  // Esc закрывает детали
  React.useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  const allTabs: WorkspaceTab[] = [{ key: "objects", label: "Объекты", count: visible.length, content: null }, ...tabs];

  const list = (
    <>
      <div className="space-y-3 px-4 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-title1">{title}</h1>
            {subtitle && <p className="text-footnote text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{actions}</div>}
        </div>
        {metrics && (
          <div
            className="bg-fill-tertiary grid grid-cols-5 gap-0.5 rounded-md p-0.5"
            role="group"
            aria-label="Фильтр по состоянию"
            data-testid="ops-indicators"
          >
            {FILTERS.map((f) => (
              <OperationalMetric
                key={f.key}
                label={f.label}
                value={objects.filter((o) => f.match(o.health)).length}
                health={f.health}
                active={filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setTab("objects");
                }}
              />
            ))}
          </div>
        )}
        {allTabs.length > 1 && <SegmentTabs tabs={allTabs} value={tab} onChange={setTab} idPrefix={tabsId} label="Разделы панели" />}
      </div>
      {controls}

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role={allTabs.length > 1 ? "tabpanel" : undefined}
        id={`${tabsId}-${tab}-panel`}
        aria-labelledby={allTabs.length > 1 ? `${tabsId}-${tab}` : undefined}
      >
        {tab === "objects" ? (
          <>
            {filterInput && (
              <div className="bg-card sticky top-0 z-[1] px-4 pb-2">
                <label className="block">
                  <span className="sr-only">Найти в списке</span>
                  <SearchField
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Номер, город, машина, водитель"
                    data-testid="workspace-filter"
                  />
                </label>
              </div>
            )}
            {visible.length === 0 ? (
              objects.length === 0 ? (
                empty
              ) : (
                <p className="text-subheadline text-muted-foreground px-4 py-8 text-center">
                  Под фильтр ничего не попало.{" "}
                  <button
                    type="button"
                    className="text-link font-medium hover:underline"
                    onClick={() => {
                      setFilter("all");
                      setQ("");
                    }}
                  >
                    Сбросить фильтр
                  </button>
                </p>
              )
            ) : (
              <ShipmentList objects={visible} selectedId={selectedId} onSelect={(id) => select(id === selectedId ? null : id)} />
            )}
            {listFooter}
          </>
        ) : (
          allTabs.find((t) => t.key === tab)?.content
        )}
      </div>
    </>
  );

  return (
    <SplitView
      testId={testId}
      listLabel={title}
      backLabel={title}
      hasDetail={Boolean(selected)}
      onBack={() => select(null)}
      list={list}
      map={
        <MapWorkspace
          objects={mapObjects}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
          className="absolute inset-0"
          emptyLabel="Нет объектов с координатами"
        />
      }
      detail={selected && <ShipmentDetailPanel key={selected.id} object={selected} now={now} onClose={() => select(null)} />}
    />
  );
}
