import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Нет доступа" };

const DEFAULT_REASON = "У вас нет доступа к этой странице.";

/**
 * Текст причины приходит в адресе (?reason=…), его может подставить кто угодно. Показываем только короткий
 * текст без ссылок и телефонов, чтобы страницу CargoFlow нельзя было использовать для фишинговых сообщений.
 */
function safeReason(reason: string | undefined) {
  const text = (reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text || /https?:|www\.|@|\+?\d[\d\s()-]{6,}/i.test(text)) return DEFAULT_REASON;
  return text;
}

export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <ShieldX className="text-tertiary-foreground mx-auto size-12 [stroke-width:1.5]" aria-hidden />
        <h1 className="text-title2 mt-3">Нет доступа</h1>
        <p className="text-subheadline text-muted-foreground mt-1.5">{safeReason(reason)}</p>
        <Button asChild className="mt-6">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
