import { Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Пустая картина, как ContentUnavailableView: что произойдёт и какое следующее действие. */
export function OperationsEmpty({ kind }: { kind: "customer" | "forwarder" | "carrier" }) {
  const carrier = kind === "carrier";
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="operations-empty">
      <MapIcon className="text-tertiary-foreground mb-3 size-10 [stroke-width:1.5]" aria-hidden />
      <p className="text-title3">Активных перевозок нет</p>
      <p className="text-subheadline text-muted-foreground mt-1 max-w-xs">
        {carrier
          ? "Возьмите груз на бирже — после выбора заказчиком рейс появится на карте с маршрутом, машиной и водителем."
          : "Разместите груз — перевозчики предложат цену, а выбранная перевозка появится на карте и в этом списке."}
      </p>
      <Button asChild variant="secondary" className="text-link mt-4">
        <Link href={carrier ? "/marketplace" : "/loads/new"}>{carrier ? "Найти груз" : "Создать груз"}</Link>
      </Button>
    </div>
  );
}

/** Пустой результат при активных фильтрах: объясняет причину и даёт сброс. */
export function FilteredEmpty({ resetHref }: { resetHref?: string }) {
  return (
    <p className="text-subheadline text-muted-foreground px-4 py-10 text-center">
      {resetHref ? "Под фильтры ничего не попало. " : "Записей нет."}
      {resetHref && (
        <Link href={resetHref} className="text-link font-medium hover:underline">
          Сбросить фильтры
        </Link>
      )}
    </p>
  );
}
