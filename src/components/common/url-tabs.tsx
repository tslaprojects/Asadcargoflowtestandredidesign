"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TabDef = { value: string; label: React.ReactNode; content: React.ReactNode; hidden?: boolean };

/** Вкладки, синхронизированные с ?tab= (ссылки из уведомлений ведут на нужную вкладку). */
export function UrlTabs({ tabs, defaultTab }: { tabs: TabDef[]; defaultTab: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const visible = tabs.filter((t) => !t.hidden);
  const requested = params.get("tab");
  const value = visible.some((t) => t.value === requested) ? requested! : defaultTab;
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const sp = new URLSearchParams(params.toString());
        sp.set("tab", v);
        router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      }}
    >
      <TabsList>
        {visible.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {visible.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
