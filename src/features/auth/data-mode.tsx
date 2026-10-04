"use client";
import { Database, FlaskConical } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { api, errorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type DataModeValue = "real" | "demo";

export const DATA_MODE_META: Record<DataModeValue, { label: string; short: string; hint: string; icon: typeof Database }> = {
  demo: { label: "Демо-база", short: "Демо", hint: "тестовые данные, можно экспериментировать", icon: FlaskConical },
  real: { label: "Реальная база", short: "Реальная", hint: "рабочие данные компании", icon: Database },
};

/** Выбор режима данных на странице входа — сегментированный контрол (радиогруппа: клавиатура и скринридеры). */
export function DataModeSelector({ value, onChange }: { value: DataModeValue; onChange: (v: DataModeValue) => void }) {
  return (
    <fieldset>
      <legend className="text-section mb-1.5 px-4">Режим данных</legend>
      <div className="bg-fill-tertiary grid grid-cols-2 gap-0.5 rounded-md p-0.5" role="radiogroup" aria-label="Режим данных">
        {(["demo", "real"] as const).map((mode) => {
          const meta = DATA_MODE_META[mode];
          const Icon = meta.icon;
          const checked = value === mode;
          return (
            <label
              key={mode}
              className={cn(
                "has-[:focus-visible]:outline-ring text-body flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[0.4375rem] font-medium transition-[background-color,box-shadow] duration-(--duration-standard) has-[:focus-visible]:outline-3 lg:h-8",
                checked ? "bg-segment-thumb shadow-control" : "text-foreground/75 hover:text-foreground",
              )}
              data-testid={`data-mode-${mode}`}
            >
              <input type="radio" name="dataMode" value={mode} checked={checked} onChange={() => onChange(mode)} className="sr-only" />
              <Icon className={cn("size-4", checked && (mode === "demo" ? "text-warning" : "text-link"))} aria-hidden />
              {meta.label}
            </label>
          );
        })}
      </div>
      <p className="text-footnote text-muted-foreground mt-1.5 px-4">{DATA_MODE_META[value].hint}</p>
    </fieldset>
  );
}

/** Индикатор текущего режима в шапке: всегда виден, демо выделено предупреждающим цветом. */
export function DataModeBadge({ mode, className }: { mode: DataModeValue; className?: string }) {
  const meta = DATA_MODE_META[mode];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "text-footnote inline-flex h-6 items-center gap-1 rounded-full px-2 font-semibold whitespace-nowrap",
        mode === "demo" ? "bg-warning-bg text-warning" : "bg-fill-tertiary text-muted-foreground",
        className,
      )}
      data-testid="data-mode-badge"
      data-mode={mode}
      title={`Режим данных: ${meta.label}`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className={cn(mode === "real" && "max-sm:sr-only")}>
        <span className="sm:hidden">{meta.short}</span>
        <span className="hidden sm:inline">{meta.label}</span>
      </span>
    </span>
  );
}

/**
 * Переключение режима после входа: сервер создаёт новую сессию; затем полная перезагрузка —
 * в браузере не остаётся данных прежнего режима (кеш маршрутизатора, состояние страниц).
 */
export function DataModeSwitchDialog({
  current,
  open,
  onOpenChange,
}: {
  current: DataModeValue;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const target: DataModeValue = current === "demo" ? "real" : "demo";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Перейти в режим «${DATA_MODE_META[target].label}»?`}
      description={
        target === "real"
          ? "Вы будете работать с реальными данными компании: все действия влияют на настоящие перевозки и документы."
          : "Вы перейдёте в демо-базу: тестовые данные, которые не затрагивают реальные перевозки."
      }
      consequences={["Учётная запись и права останутся прежними.", "Приложение перезагрузится с данными выбранного режима."]}
      confirmLabel={`Перейти: ${DATA_MODE_META[target].short}`}
      pendingLabel="Переключаем..."
      onConfirm={async () => {
        try {
          const res = await api<{ redirectTo: string }>("/api/auth/data-mode", { body: { dataMode: target } });
          window.location.assign(res.redirectTo);
          return true;
        } catch (e) {
          toast.error(errorMessage(e));
          return false;
        }
      }}
    />
  );
}

const STORAGE_KEY = "cf:last-data-mode";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readSaved(): DataModeValue | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "demo" || v === "real" ? v : null;
  } catch {
    return null;
  }
}

/** Последний выбранный режим входа (удобство; на сервере не используется, режим всегда проверяется сервером). */
export function useRememberedDataMode(initial: DataModeValue): [DataModeValue, (m: DataModeValue) => void] {
  const saved = React.useSyncExternalStore(subscribe, readSaved, () => null);
  // Если хранилище недоступно (приватный режим), выбор живёт в состоянии компонента
  const [override, setOverride] = React.useState<DataModeValue | null>(null);
  const update = (m: DataModeValue) => {
    setOverride(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* без запоминания */
    }
    listeners.forEach((l) => l());
  };
  return [override ?? saved ?? initial, update];
}
