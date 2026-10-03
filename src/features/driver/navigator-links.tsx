import { Navigation } from "lucide-react";
import { t } from "@/lib/i18n";
import { NAVIGATOR_APPS, navigatorWebLink, type NavTarget } from "@/lib/geo/navigators";
import { cn } from "@/lib/utils";

/**
 * «Маршрут в навигаторе»: Яндекс, 2ГИС, Google — обычные https-ссылки.
 * На телефоне ссылку перехватывает установленное приложение, иначе откроется веб-версия карт.
 */
export function NavigatorLinks({ target, className, testId }: { target: NavTarget; className?: string; testId?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} data-testid={testId}>
      <p className="text-muted-foreground text-footnote flex items-center gap-1.5">
        <Navigation className="size-3.5" aria-hidden /> {t("route.navigator")}
      </p>
      <div className="flex flex-wrap gap-2">
        {NAVIGATOR_APPS.map((app) => (
          <a
            key={app}
            href={navigatorWebLink(app, target)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-fill-tertiary text-link hover:bg-fill-secondary text-subheadline inline-flex min-h-9 items-center rounded-full px-3.5 font-medium transition-colors duration-(--duration-micro)"
            data-navigator={app}
          >
            {t(`route.navigators.${app}`)}
          </a>
        ))}
      </div>
    </div>
  );
}
