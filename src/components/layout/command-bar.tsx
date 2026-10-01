"use client";
import { ArrowRight, Building2, CornerDownLeft, Loader2, Package, Search, Truck, type LucideIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";
import * as React from "react";
import { StatusBadge } from "@/components/common/status-badge";
import { api } from "@/lib/client/api";
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

/** Кнопка вызова командной строки в шапке — выглядит как поле поиска. */
export function CommandTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "border-border bg-surface-secondary text-muted-foreground hover:border-border-strong hover:bg-card flex h-9 w-full items-center gap-2 rounded-md border px-2.5 text-sm transition-colors duration-150",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-left">Поиск: перевозка, груз, госномер, компания…</span>
      <kbd className="border-border bg-card text-muted-foreground hidden rounded-sm border px-1.5 font-sans text-[0.6875rem] font-medium sm:inline">
        {shortcut}
      </kbd>
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
    const t = setTimeout(async () => {
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
      clearTimeout(t);
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
        <DialogPrimitive.Overlay className="bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out fixed inset-0 z-50" />
        <DialogPrimitive.Content
          className="border-border bg-card data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out fixed top-[12vh] left-1/2 z-50 flex max-h-[72dvh] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-xl"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Командная строка</DialogPrimitive.Title>
          <div className="border-border flex items-center gap-2 border-b px-4">
            {loading ? (
              <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            )}
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Номер перевозки или груза, город, госномер, компания или раздел"
              className="placeholder:text-muted-foreground h-12 flex-1 bg-transparent text-base outline-none sm:text-sm"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={commands[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              aria-label="Поиск и команды"
              data-testid="command-input"
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Результаты" className="flex-1 overflow-y-auto p-2">
            {commands.length === 0 && (
              <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                {loading ? "Ищем…" : "Ничего не найдено. Попробуйте номер перевозки (CF-O-…), город или госномер."}
              </p>
            )}
            {commands.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              const Icon = c.icon;
              return (
                <React.Fragment key={c.id}>
                  {header && <p className="text-overline px-2 pt-2 pb-1">{header}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseMove={() => setActive(i)}
                    onClick={c.run}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors duration-100",
                      i === activeIndex ? "bg-accent text-foreground" : "text-foreground",
                    )}
                  >
                    <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-md">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate font-medium", c.code && "id-code")}>{c.label}</span>
                      {c.hint && <span className="text-muted-foreground block truncate text-xs">{c.hint}</span>}
                    </span>
                    {c.status && <StatusBadge kind="OrderStatus" value={c.status} />}
                    {i === activeIndex && <CornerDownLeft className="text-muted-foreground size-3.5 shrink-0" aria-hidden />}
                    {i !== activeIndex && <ArrowRight className="size-3.5 shrink-0 opacity-0" aria-hidden />}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div className="border-border text-muted-foreground bg-surface-secondary flex items-center gap-4 border-t px-4 py-2 text-xs">
            <span>
              <kbd className="font-sans">↑↓</kbd> выбор
            </span>
            <span>
              <kbd className="font-sans">Enter</kbd> открыть
            </span>
            <span>
              <kbd className="font-sans">Esc</kbd> закрыть
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
