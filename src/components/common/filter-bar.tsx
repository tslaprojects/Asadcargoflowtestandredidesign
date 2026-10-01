"use client";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FilterField =
  | { type: "search"; name: string; placeholder?: string; label?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }
  | { type: "text"; name: string; label: string; placeholder?: string }
  | { type: "number"; name: string; label: string; placeholder?: string }
  | { type: "date"; name: string; label: string }
  | { type: "checkbox"; name: string; label: string };

/** Сколько фильтров (кроме поиска) видно в строке на desktop; остальные — в панели «Фильтры». */
const INLINE_FIELDS = 3;

/**
 * Панель фильтров, синхронизированная с URL (серверная фильтрация и пагинация).
 * Прогрессивное раскрытие: поиск + основные фильтры в строке, остальные — по кнопке «Фильтры» (со счётчиком активных).
 * На мобильном в строке только поиск и кнопка — список начинается на первом экране.
 */
export function FilterBar({
  fields,
  className,
  inlineFields = INLINE_FIELDS,
  bare,
}: {
  fields: FilterField[];
  className?: string;
  /** Сколько фильтров видно сразу (в узкой панели — меньше). */
  inlineFields?: number;
  /** Без рамки — внутри панели рабочего пространства. */
  bare?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, params.get(f.name) ?? ""])),
  );
  const [pending, startTransition] = React.useTransition();
  const panelId = React.useId();

  const nonSearch = fields.filter((f) => f.type !== "search");
  const inline = new Set(nonSearch.slice(0, inlineFields).map((f) => f.name));
  const hasAdvanced = nonSearch.length > inlineFields;
  const activeCount = nonSearch.filter((f) => params.get(f.name)).length;
  const advancedActive = nonSearch.some((f) => !inline.has(f.name) && params.get(f.name));
  const [open, setOpen] = React.useState(advancedActive);

  const apply = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const f of fields) {
      const v = next[f.name];
      if (v) sp.set(f.name, v);
      else sp.delete(f.name);
    }
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  };

  const set = (name: string, v: string, immediate = false) => {
    const next = { ...values, [name]: v };
    setValues(next);
    if (immediate) apply(next);
  };

  const hasActive = fields.some((f) => params.get(f.name));

  /** Видимость поля: основные — всегда на desktop, на мобильном — в раскрытой панели; дополнительные — только в панели. */
  const visibility = (name: string) => (inline.has(name) ? (open ? "" : "max-md:hidden") : open ? "animate-rise-in" : "hidden");

  return (
    <form
      className={cn(bare ? "px-3 pb-2" : "border-border bg-card mb-4 rounded-lg border p-3 shadow-xs", className)}
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
      role="search"
      aria-busy={pending}
    >
      <div id={panelId} className="flex flex-wrap items-end gap-3">
        {fields.map((f) => {
          const id = `f-${f.name}`;
          if (f.type === "search")
            return (
              <div key={f.name} className="min-w-0 flex-1 basis-full md:basis-64">
                <Label htmlFor={id} className="sr-only">
                  {f.label ?? "Поиск"}
                </Label>
                <div className="relative">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    id={id}
                    type="search"
                    className="pl-9"
                    placeholder={f.placeholder ?? "Поиск"}
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                </div>
              </div>
            );
          const wrap = cn(bare ? "w-[calc(50%-0.375rem)] space-y-1" : "w-[calc(50%-0.375rem)] space-y-1 sm:w-44", visibility(f.name));
          if (f.type === "select")
            return (
              <div key={f.name} className={wrap}>
                <Label htmlFor={id} className="text-muted-foreground text-xs">
                  {f.label}
                </Label>
                <NativeSelect id={id} value={values[f.name]} onChange={(e) => set(f.name, e.target.value, true)}>
                  <option value="">{f.allLabel ?? "Все"}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            );
          if (f.type === "checkbox")
            return (
              <label key={f.name} className={cn("flex min-h-10 items-center gap-2 text-sm sm:min-h-9", visibility(f.name))}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={values[f.name] === "1"}
                  onChange={(e) => set(f.name, e.target.checked ? "1" : "", true)}
                />
                {f.label}
              </label>
            );
          return (
            <div key={f.name} className={wrap}>
              <Label htmlFor={id} className="text-muted-foreground text-xs">
                {f.label}
              </Label>
              <Input
                id={id}
                type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                min={f.type === "number" ? 0 : undefined}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                value={values[f.name]}
                onChange={(e) => set(f.name, e.target.value, f.type === "date")}
              />
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          {(hasAdvanced || nonSearch.length > 0) && (
            <Button
              type="button"
              variant="outline"
              size={bare ? "sm" : "default"}
              className={cn(!hasAdvanced && "md:hidden")}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={panelId}
            >
              <SlidersHorizontal /> Фильтры
              {activeCount > 0 && (
                <span className="bg-primary num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.6875rem] font-semibold text-white">
                  {activeCount}
                </span>
              )}
            </Button>
          )}
          <Button
            type="submit"
            size={bare ? "sm" : "default"}
            loading={pending}
            loadingText="Ищем..."
            className={cn(bare && nonSearch.length === 0 && "sr-only")}
          >
            Применить
          </Button>
          {hasActive && (
            <Button
              type="button"
              variant="ghost"
              size={bare ? "sm" : "default"}
              onClick={() => {
                const cleared = Object.fromEntries(fields.map((f) => [f.name, ""]));
                setValues(cleared);
                apply(cleared);
              }}
            >
              <X /> Сбросить
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
