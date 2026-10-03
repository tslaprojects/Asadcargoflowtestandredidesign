import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-tertiary-foreground num text-[3.5rem] leading-none font-semibold tracking-[-0.03em]">404</p>
        <h1 className="text-title2 mt-3">Страница не найдена</h1>
        <p className="text-subheadline text-muted-foreground mt-1.5">Возможно, объект был удалён или у вас нет к нему доступа.</p>
        <Button asChild className="mt-6">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
