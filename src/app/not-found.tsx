import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-muted-foreground text-5xl font-bold">404</p>
        <h1 className="text-title2 mt-3 font-semibold">Страница не найдена</h1>
        <p className="text-muted-foreground text-body mt-2">Возможно, объект был удалён или у вас нет к нему доступа.</p>
        <Button asChild className="mt-6">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
