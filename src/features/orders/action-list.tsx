import { AlertCircle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionItem } from "@/server/services/dashboard.service";
import { cn } from "@/lib/utils";

export function ActionList({ items, title = "Требуют вашего действия" }: { items: ActionItem[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CheckCircle2 className="text-success size-4" aria-hidden /> Сейчас ничего не требует вашего внимания
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {items.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="group flex items-center gap-3 py-2.5">
                  {a.tone === "info" ? (
                    <Info className="text-info size-4 shrink-0" aria-hidden />
                  ) : (
                    <AlertCircle className={cn("size-4 shrink-0", a.tone === "danger" ? "text-danger" : "text-warning")} aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="group-hover:text-primary block text-sm font-medium">{a.title}</span>
                    <span className="text-muted-foreground block text-xs">{a.description}</span>
                  </span>
                  <ArrowRight className="text-muted-foreground group-hover:text-primary size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
