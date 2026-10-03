"use client";
import { Toaster as Sonner } from "sonner";

/**
 * Баннеры результата действий, как уведомления macOS/iOS: нейтральный материал, цвет — только у значка.
 * 4 с, не больше 3 одновременно, не забирают фокус (aria-live).
 */
export function Toaster() {
  return (
    <Sonner
      theme="system"
      position="top-right"
      closeButton
      visibleToasts={3}
      offset={14}
      mobileOffset={10}
      gap={8}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "!material-menu !shadow-menu !text-foreground !font-sans !text-body !rounded-xl !border-0 !px-3.5 !py-3 !gap-2.5 !items-start",
          title: "!font-semibold",
          description: "!text-subheadline !text-muted-foreground",
          icon: "!mt-px",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-info",
          closeButton: "!bg-elevated !text-muted-foreground !border-0 !shadow-menu",
        },
      }}
    />
  );
}
