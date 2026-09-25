"use client";
import { Search, X } from "lucide-react";
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

/** Панель фильтров, синхронизированная с URL (серверная фильтрация и пагинация). */
export function FilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, params.get(f.name) ?? ""])),
  );
  const [pending, startTransition] = React.useTransition();

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

  return (
    <form
      className={cn("border-border bg-card mb-4 rounded-xl border p-3 shadow-xs", className)}
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
      role="search"
      aria-busy={pending}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {fields.map((f) => {
          const id = `f-${f.name}`;
          if (f.type === "search")
            return (
              <div key={f.name} className="col-span-2 md:col-span-2">
                <Label htmlFor={id} className="sr-only">
                  {f.label ?? "Поиск"}
                </Label>
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
                  <Input
                    id={id}
                    className="pl-8"
                    placeholder={f.placeholder ?? "Поиск"}
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                </div>
              </div>
            );
          if (f.type === "select")
            return (
              <div key={f.name} className="space-y-1">
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
              <label key={f.name} className="flex items-end gap-2 pb-2 text-sm">
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
            <div key={f.name} className="space-y-1">
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
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" loading={pending} loadingText="Ищем...">
          Применить
        </Button>
        {hasActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
    </form>
  );
}
