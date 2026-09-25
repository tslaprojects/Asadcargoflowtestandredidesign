"use client";
import { Building2, Package, Search, Truck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Result = {
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

export function GlobalSearch({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState<Result | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setRes(await api<Result>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }));
        setOpen(true);
      } catch {
        /* игнорируем прерванные запросы */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    onNavigate?.();
    router.push(href);
  };

  const groups = res
    ? [
        {
          title: "Перевозки",
          icon: Truck,
          items: res.orders.map((o) => ({
            key: o.id,
            href: `/orders/${o.id}`,
            main: o.publicNumber,
            sub: `${o.load.originCity ?? ""} → ${o.load.destinationCity ?? ""}`,
          })),
        },
        {
          title: "Грузы",
          icon: Package,
          items: res.loads.map((l) => ({
            key: l.id,
            href: `/loads/${l.id}`,
            main: `${l.publicNumber} · ${l.title}`,
            sub: `${l.originCity ?? ""} → ${l.destinationCity ?? ""}`,
          })),
        },
        {
          title: "Компании",
          icon: Building2,
          items: res.companies.map((c) => ({ key: c.id, href: `/companies/${c.id}`, main: c.legalName, sub: c.city })),
        },
        {
          title: "Автомобили",
          icon: Truck,
          items: res.vehicles.map((v) => ({
            key: v.id,
            href: `/vehicles?q=${encodeURIComponent(v.plateNumber)}`,
            main: v.plateNumber,
            sub: `${v.make} ${v.model}`,
          })),
        },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) go(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Глобальный поиск
        </label>
        <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          id={`${listId}-input`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => res && setOpen(true)}
          placeholder="Поиск: номер заказа, груза, компания, госномер…"
          className="bg-muted/60 text-foreground pl-8"
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
        />
        {loading && <Loader2 className="text-muted-foreground absolute top-2.5 right-2.5 size-4 animate-spin" aria-hidden />}
      </form>
      {open && q.trim().length >= 2 && res && (
        <div
          id={listId}
          className="border-border bg-card text-foreground absolute z-40 mt-1 max-h-[70vh] w-full min-w-72 overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {groups.length === 0 && <p className="text-muted-foreground p-3 text-sm">Ничего не найдено</p>}
          {groups.map((g) => (
            <div key={g.title} className="py-1">
              <p className="text-muted-foreground flex items-center gap-1.5 px-2 py-1 text-xs font-medium uppercase">
                <g.icon className="size-3.5" aria-hidden /> {g.title}
              </p>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => go(it.href)}
                  className="hover:bg-muted block w-full rounded-md px-2 py-1.5 text-left"
                >
                  <span className="block text-sm font-medium">{it.main}</span>
                  <span className="text-muted-foreground block text-xs">{it.sub}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
