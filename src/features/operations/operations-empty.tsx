import { Radar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Пустая операционная картина: объясняет, что произойдёт и какое следующее действие. */
export function OperationsEmpty({ kind }: { kind: "customer" | "forwarder" | "carrier" }) {
  const carrier = kind === "carrier";
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center" data-testid="operations-empty">
      <span className="bg-accent text-primary mb-3 grid size-10 place-items-center rounded-lg">
        <Radar className="size-5" aria-hidden />
      </span>
      <p className="text-h3">Активных перевозок нет</p>
      <p className="text-muted-foreground mt-1 max-w-xs text-sm">
        {carrier
          ? "Возьмите груз на бирже — после выбора заказчиком рейс появится на карте с маршрутом, машиной и водителем."
          : "Разместите груз — перевозчики предложат цену, а выбранная перевозка появится на карте и в этом списке."}
      </p>
      <Button asChild size="sm" className="mt-4">
        <Link href={carrier ? "/marketplace" : "/loads/new"}>{carrier ? "Найти груз" : "Создать груз"}</Link>
      </Button>
    </div>
  );
}

/** Пустой результат при активных фильтрах: объясняет причину и даёт сброс. */
export function FilteredEmpty({ resetHref }: { resetHref?: string }) {
  return (
    <p className="text-muted-foreground px-4 py-8 text-center text-sm">
      {resetHref ? "Под фильтры ничего не попало. " : "Записей нет."}
      {resetHref && (
        <Link href={resetHref} className="text-primary font-medium hover:underline">
          Сбросить фильтры
        </Link>
      )}
    </p>
  );
}
