"use client";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/** Сегментированный контрол: белый бегунок на сером треке. Много сегментов — прокрутка по горизонтали. */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "bg-fill-tertiary inline-flex h-9 max-w-full scrollbar-none items-stretch gap-0.5 overflow-x-auto rounded-md p-0.5 lg:h-7",
        className,
      )}
      {...props}
    />
  );
}
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "text-foreground/80 hover:text-foreground data-[state=active]:bg-segment-thumb data-[state=active]:shadow-control data-[state=active]:text-foreground text-callout lg:text-body inline-flex min-w-0 flex-auto shrink-0 items-center justify-center gap-1.5 rounded-[0.4375rem] px-3 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-(--duration-standard) disabled:opacity-40 [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("data-[state=active]:animate-fade-in pt-4 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
