"use client";
import { Building2, CornerDownLeft, Loader2, Package, Search, Truck, type LucideIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";
import * as React from "react";
import { StatusBadge } from "@/components/common/status-badge";
import { api } from "@/lib/client/api";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { navItems, type NavKind } from "./nav-config";

type SearchResult = {
  orders: {
    id: string;
    publicNumber: string;
    currentStatus: string;
    load: { originCity: string | null; destinationCity: string | null };
  }[];
  loads: { id: string; publicNumber: string; title: string; originCity: string | null; destinationCity: string | null }[];
  companies: { id: string; legalName: string; city: string }[];
  vehicles: { id: string; plateNumber: string; make: string; model: string }[];
};

export type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  status?: string;
  /** Номер документа/госномер — табличные цифры, перечёркнутый ноль. */
  code?: boolean;
  run: () => void;
};

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const subscribeNoop = () => () => undefined;

/** Подпись сочетания клавиш: ⌘K на Mac, Ctrl K на остальных (на сервере — Ctrl K). */
export function useShortcutLabel() {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => (isMac() ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** Поле поиска в тулбаре, как в macOS: серая заливка, лупа, подсказка сочетания клавиш. */
export function CommandTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "bg-fill-tertiary text-muted-foreground hover:bg-fill-secondary text-body flex h-7 items-center gap-1.5 rounded-md px-2 transition-colors duration-(--duration-micro)",
        className,
      )}
    >
      <Search className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{t("nav.searchShort")}</span>
      <kbd className="text-footnote text-tertiary-foreground font-sans">{shortcut}</kbd>
    </button>
  );
}

/**
 * Командная строка CargoFlow (⌘K / Ctrl+K): поиск объектов (перевозки, грузы, компании, машины),
 * переход по разделам и быстрые действия. Клавиатура: ↑/↓ — выбор, Enter — открыть, Esc — закрыть.
 */
export function CommandBar({ kind, open, onOpenChange }: { kind: NavKind; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState<SearchResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);

  const go = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      setQ("");
      setRes(null);
      router.push(href);
    },
    [onOpenChange, router],
  );

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setRes(await api<SearchResult>(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }));
      } catch {
        /* прерванный запрос */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const term = q.trim().toLowerCase();
  const commands: Command[] = React.useMemo(() => {
    const list: Command[] = [];
    if (term.length >= 2 && res) {
      for (const o of res.orders)
        list.push({
          id: `o-${o.id}`,
          group: "Перевозки",
          label: o.publicNumber,
          hint: `${o.load.originCity ?? "—"} → ${o.load.destinationCity ?? "—"}`,
          icon: Truck,
          status: o.currentStatus,
          code: true,
          run: () => go(`/orders/${o.id}`),
        });
      for (const l of res.loads)
        list.push({
          id: `l-${l.id}`,
          group: "Грузы",
          label: `${l.publicNumber} · ${l.title}`,
          hint: `${l.originCity ?? "—"} → ${l.destinationCity ?? "—"}`,
          icon: Package,
          code: true,
          run: () => go(`/loads/${l.id}`),
        });
      for (const v of res.vehicles)
        list.push({
          id: `v-${v.id}`,
          group: "Автопарк",
          label: v.plateNumber,
          hint: `${v.make} ${v.model}`,
          icon: Truck,
          code: true,
          run: () => go(`/vehicles?q=${encodeURIComponent(v.plateNumber)}`),
        });
      for (const c of res.companies)
        list.push({
          id: `c-${c.id}`,
          group: "Компании",
          label: c.legalName,
          hint: c.city,
          icon: Building2,
          run: () => go(`/companies/${c.id}`),
        });
    }
    const nav = navItems(kind).filter((i) => !term || i.label.toLowerCase().includes(term));
    for (const i of nav) list.push({ id: `n-${i.href}`, group: "Разделы", label: i.label, icon: i.icon, run: () => go(i.href) });
    if (term.length >= 2)
      list.push({
        id: "search-all",
        group: "Поиск",
        label: `Все результаты по «${q.trim()}»`,
        icon: Search,
        run: () => go(`/search?q=${encodeURIComponent(q.trim())}`),
      });
    return list;
  }, [term, res, kind, go, q]);

  const activeIndex = Math.min(active, Math.max(0, commands.length - 1));

  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, commands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + commands.length) % Math.max(1, commands.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commands[activeIndex]?.run();
    }
  };

  let lastGroup = "";
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setQ("");
          setRes(null);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out fixed inset-0 z-50 bg-black/5 dark:bg-black/25" />
        <DialogPrimitive.Content
          className="material-menu shadow-dialog data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out fixed top-[14vh] left-1/2 z-50 flex max-h-[68dvh] w-[calc(100%-1.5rem)] max-w-[38rem] -translate-x-1/2 flex-col overflow-hidden rounded-xl outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Командная строка</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 px-4">
            {loading ? (
              <Loader2 className="text-muted-foreground size-5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Search className="text-muted-foreground size-5 shrink-0" aria-hidden />
            )}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={t("nav.searchHint")}
              className="text-title3 placeholder:text-tertiary-foreground h-14 flex-1 bg-transparent font-normal outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={commands[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              aria-label="Поиск и команды"
              data-testid="command-input"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Результаты"
            className="hairline-t flex-1 overflow-y-auto overscroll-contain p-1.5"
          >
            {commands.length === 0 && (
              <p className="text-subheadline text-muted-foreground px-3 py-8 text-center">
                {loading ? "Ищем…" : "Ничего не найдено. Попробуйте номер перевозки (CF-O-…), город или госномер."}
              </p>
            )}
            {commands.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              const Icon = c.icon;
              const selected = i === activeIndex;
              return (
                <React.Fragment key={c.id}>
                  {header && <p className="text-section px-2.5 pt-2.5 pb-1">{header}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setActive(i)}
                    onClick={c.run}
                    className={cn(
                      "flex min-h-11 cursor-default items-center gap-2.5 rounded-md px-2.5 py-1 lg:min-h-9",
                      selected ? "bg-selection text-selection-foreground" : "text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", selected ? "text-selection-foreground" : "text-muted-foreground")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", c.code && "id-code")}>{c.label}</span>
                      {c.hint && (
                        <span
                          className={cn(
                            "text-footnote block truncate",
                            selected ? "text-selection-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {c.hint}
                        </span>
                      )}
                    </span>
                    {c.status && (
                      <span className={cn(selected && "[&_*]:!text-selection-foreground")}>
                        <StatusBadge kind="OrderStatus" value={c.status} />
                      </span>
                    )}
                    {selected && <CornerDownLeft className="size-3.5 shrink-0 opacity-80" aria-hidden />}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div className="hairline-t text-caption text-muted-foreground flex items-center gap-4 px-4 py-1.5">
            <span>
              <kbd className="font-sans">↑↓</kbd> выбор
            </span>
            <span>
              <kbd className="font-sans">↩</kbd> открыть
            </span>
            <span>
              <kbd className="font-sans">esc</kbd> закрыть
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
