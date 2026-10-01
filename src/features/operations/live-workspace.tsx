"use client";
import { Search } from "lucide-react";
import * as React from "react";
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

const desktopQuery = "(min-width: 1024px)";
function useDesktop() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(desktopQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );
}

export function toMapObject(o: LiveObject): MapObject {
  return {
    id: o.id,
    label: `${o.publicNumber}: ${o.origin} → ${o.destination}, ${o.statusLabel}`,
    health: o.health,
    position: o.position,
    route: o.stops.filter((s) => s.point).map((s) => [s.point!.lng, s.point!.lat] as [number, number]),
  };
}

export type WorkspaceTab = { key: string; label: string; count?: number; content: React.ReactNode };

/**
 * Рабочее пространство «карта + живые объекты + контекст»: слева — индикаторы, фильтр и список,
 * в центре — карта, справа — контекстная панель выбранного объекта (на мобильном — bottom sheet).
 * Выбор объекта отражается в адресе (?selected=…) — ссылкой можно поделиться.
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
  /** Дополнительные вкладки левой панели (внимание, события, рекомендации). */
  tabs?: WorkspaceTab[];
  empty?: React.ReactNode;
  listFooter?: React.ReactNode;
  metrics?: boolean;
  /** Серверные фильтры (URL) под заголовком панели. */
  controls?: React.ReactNode;
  /** Быстрый поиск по загруженному списку. */
  filterInput?: boolean;
  testId?: string;
}) {
  const desktop = useDesktop();
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

  // Esc закрывает контекстную панель
  React.useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  // Bottom sheet (mobile): свайп вниз закрывает
  const touchY = React.useRef<number | null>(null);

  const allTabs: WorkspaceTab[] = [{ key: "objects", label: "Объекты", count: visible.length, content: null }, ...tabs];

  return (
    <div className="relative h-full overflow-hidden" data-testid={testId}>
      <MapWorkspace
        objects={mapObjects}
        selectedId={selectedId}
        onSelect={(id) => select(id)}
        className="absolute inset-x-0 top-0 h-[38%] lg:h-full"
        padding={desktop ? { left: 392, right: selected ? 408 : 56, top: 56, bottom: 56 } : { left: 24, right: 24, top: 24, bottom: 24 }}
        emptyLabel="Нет объектов с координатами"
      />

      {/* Левая панель: заголовок, индикаторы, фильтр, список/вкладки (на мобильном — под картой) */}
      <aside
        className="bg-card border-border absolute inset-x-0 top-[38%] bottom-0 z-[3] flex flex-col border-t lg:top-3 lg:right-auto lg:bottom-3 lg:left-3 lg:w-[23rem] lg:rounded-lg lg:border lg:shadow-md"
        aria-label={title}
      >
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-h1 leading-7">{title}</h1>
              {subtitle && <p className="text-muted-foreground truncate text-xs">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
          </div>
          {metrics && (
            <div className="-mx-1 mt-2 grid grid-cols-5 gap-0.5" role="group" aria-label="Фильтр по состоянию" data-testid="ops-indicators">
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
        </div>
        {controls}

        {allTabs.length > 1 && (
          <div
            role="tablist"
            aria-label="Разделы панели"
            className="border-border flex [scrollbar-width:none] gap-0.5 overflow-x-auto border-b px-2"
          >
            {allTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${tabsId}-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`${tabsId}-${t.key}-panel`}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative -mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                  tab === t.key ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="bg-muted text-muted-foreground num rounded-sm px-1 text-[0.6875rem]">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          role={allTabs.length > 1 ? "tabpanel" : undefined}
          id={`${tabsId}-${tab}-panel`}
          aria-labelledby={allTabs.length > 1 ? `${tabsId}-${tab}` : undefined}
        >
          {tab === "objects" ? (
            <>
              {filterInput && (
                <div className="bg-card sticky top-0 z-[1] px-3 pt-2 pb-2">
                  <label className="relative block">
                    <span className="sr-only">Найти в списке</span>
                    <Search className="text-muted-foreground pointer-events-none absolute top-2 left-2.5 size-4" aria-hidden />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Номер, город, машина, водитель"
                      className="border-border bg-surface-secondary focus:border-primary focus:bg-card h-8 w-full rounded-md border pr-2 pl-8 text-base transition-colors duration-150 outline-none sm:text-sm"
                      data-testid="workspace-filter"
                    />
                  </label>
                </div>
              )}
              {visible.length === 0 ? (
                objects.length === 0 ? (
                  empty
                ) : (
                  <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                    Под фильтр ничего не попало.{" "}
                    <button
                      type="button"
                      className="text-primary font-medium hover:underline"
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
      </aside>

      {/* Контекстная панель выбранного объекта: справа (desktop) или bottom sheet (mobile) */}
      {selected && (
        <aside
          key={selected.id}
          className={cn(
            "bg-card border-border absolute z-[4] flex flex-col overflow-hidden border shadow-lg",
            desktop
              ? "animate-panel-in top-3 right-3 bottom-3 w-[24rem] rounded-lg"
              : "animate-sheet-in-bottom inset-x-0 bottom-0 max-h-[82%] rounded-t-2xl",
          )}
          onTouchStart={(e) => {
            // Свайп считается только от «ручки» и шапки панели, чтобы не мешать прокрутке содержимого
            const top = e.currentTarget.getBoundingClientRect().top;
            if (!desktop && e.touches[0].clientY - top < 84) touchY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (desktop || touchY.current === null) return;
            const dy = e.changedTouches[0].clientY - touchY.current;
            touchY.current = null;
            if (dy > 90) select(null);
          }}
        >
          {!desktop && <span aria-hidden className="bg-border-strong mx-auto mt-2 h-1 w-10 shrink-0 rounded-full" />}
          <ShipmentDetailPanel object={selected} now={now} onClose={() => select(null)} className="min-h-0 flex-1" />
        </aside>
      )}
    </div>
  );
}
