"use client";
import { Tooltip as T } from "radix-ui";
import * as React from "react";

/** Подсказка macOS: маленькая плашка из материала меню, без стрелки. */
function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <T.Provider delayDuration={450}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={6}
            className="material-menu shadow-menu text-footnote text-foreground data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-out z-50 max-w-xs rounded-sm px-2 py-1"
          >
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export { Tooltip };
