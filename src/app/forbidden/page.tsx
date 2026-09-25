import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Нет доступа" };

export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <ShieldX className="text-danger mx-auto size-12" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">Нет доступа</h1>
        <p className="text-muted-foreground mt-2 text-sm">{reason?.slice(0, 200) || "У вас нет доступа к этой странице."}</p>
        <Button asChild className="mt-6">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
