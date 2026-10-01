"use client";
import { Toaster as Sonner } from "sonner";

/**
 * Уведомления о результате действий: 4 с, не больше 3 одновременно, не забирают фокус (aria-live).
 * Цвета — семантические токены (success/warning/info/danger).
 */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      visibleToasts={3}
      offset={16}
      mobileOffset={12}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: "!rounded-xl !border !shadow-md !font-sans !text-sm !gap-2.5",
          title: "!font-medium",
          description: "!text-[0.8125rem] !opacity-90",
        },
      }}
      style={
        {
          "--success-bg": "var(--success-bg)",
          "--success-text": "var(--success)",
          "--success-border": "var(--success-border)",
          "--error-bg": "var(--danger-bg)",
          "--error-text": "var(--danger)",
          "--error-border": "var(--danger-border)",
          "--warning-bg": "var(--warning-bg)",
          "--warning-text": "var(--warning)",
          "--warning-border": "var(--warning-border)",
          "--info-bg": "var(--info-bg)",
          "--info-text": "var(--info)",
          "--info-border": "var(--info-border)",
        } as React.CSSProperties
      }
    />
  );
}
