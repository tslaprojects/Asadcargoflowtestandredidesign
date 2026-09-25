"use client";
import { Tooltip as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

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
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={6}
            className={cn("z-50 max-w-xs rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-md")}
          >
            {content}
            <T.Arrow className="fill-slate-900" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export { Tooltip };
