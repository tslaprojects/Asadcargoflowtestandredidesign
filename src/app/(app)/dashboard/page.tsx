import { Navigation, PackagePlus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEFAULT_TZ } from "@/lib/format";
import { EventStream } from "@/features/operations/event-stream";
import { LiveWorkspace, type WorkspaceTab } from "@/features/operations/live-workspace";
import { OperationsEmpty } from "@/features/operations/operations-empty";
import { ActionList } from "@/features/orders/action-list";
import { navKindFor, pageActor } from "@/server/page-context";
import { carrierDashboard, customerDashboard, forwarderDashboard, type ActionItem } from "@/server/services/dashboard.service";
import { nextLoadPreviews } from "@/server/services/next-load.service";
import { liveOperations } from "@/server/services/operations.service";

export const metadata: Metadata = { title: "Операции" };

const todayLabel = () =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: DEFAULT_TZ, weekday: "short", day: "numeric", month: "long" }).format(new Date());

/**
 * Live Operations — главный экран: карта с живыми объектами, компактные индикаторы-фильтры,
 * список перевозок, контекстная панель выбранной перевозки, «Требует внимания» и поток событий.
 */
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ selected?: string }> }) {
  const actor = await pageActor();
  const kind = navKindFor(actor);
  if (kind === "driver") redirect("/driver");
  if (kind === "admin") redirect("/admin");
  if (kind === "none") redirect("/company/new");
  const { selected } = await searchParams;
  const company = actor.active!.company.legalName;

  const [ops, actions, previews] = await Promise.all([
    liveOperations(actor),
    (kind === "carrier" ? carrierDashboard(actor) : kind === "forwarder" ? forwarderDashboard(actor) : customerDashboard(actor)).then(
      (d) => d.actions as ActionItem[],
    ),
    kind === "carrier" ? nextLoadPreviews(actor) : Promise.resolve([]),
  ]);
  const now = new Date().toISOString();

  const tabs: WorkspaceTab[] = [
    {
      key: "attention",
      label: "Внимание",
      count: actions.length,
      content: <ActionList items={actions} bare />,
    },
    { key: "events", label: "События", content: <EventStream events={ops.events} now={now} className="py-2" /> },
  ];
  if (kind === "carrier") {
    tabs.push({
      key: "next",
      label: "След. рейс",
      count: previews.length,
      content: (
        <div className="space-y-3 px-2 pb-3" data-testid="next-load-previews">
          {previews.length === 0 ? (
            <p className="text-subheadline text-muted-foreground px-2 py-2">
              Когда машина будет подъезжать к точке разгрузки, здесь появятся грузы для следующего рейса — без порожнего пробега.
            </p>
          ) : (
            <ul className="[&>li+li_[data-row-content]]:hairline-t">
              {previews.map((p) => (
                <li key={p.vehicleId}>
                  <Link
                    href={p.movementId ? `/next-load?vehicle=${p.vehicleId}&movement=${p.movementId}` : `/next-load?vehicle=${p.vehicleId}`}
                    className="hover:bg-fill-quaternary block rounded-md px-2.5 transition-colors duration-(--duration-micro)"
                  >
                    <span data-row-content className="block py-2.5">
                      <span className="text-footnote text-muted-foreground block">
                        <span className="id-code text-foreground font-medium">{p.plateNumber}</span> · рейс{" "}
                        <span className="id-code">{p.orderNumber}</span>
                      </span>
                      <span className="mt-0.5 block">{p.message}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="secondary" className="text-link w-full">
            <Link href="/next-load">
              <Navigation /> Спланировать следующий рейс
            </Link>
          </Button>
        </div>
      ),
    });
  }

  const actionsNode =
    kind === "carrier" ? (
      <Button asChild size="sm" variant="secondary">
        <Link href="/marketplace">
          <Search /> Биржа
        </Link>
      </Button>
    ) : (
      <>
        {kind === "forwarder" && (
          <Button asChild size="icon-sm" variant="ghost" aria-label="Перевозчики">
            <Link href="/carriers">
              <Users />
            </Link>
          </Button>
        )}
        <Button asChild size="sm">
          <Link href="/loads/new">
            <PackagePlus /> Груз
          </Link>
        </Button>
      </>
    );

  return (
    <LiveWorkspace
      title="Операции"
      subtitle={
        <span className="first-letter:uppercase">
          {todayLabel()} · {company}
        </span>
      }
      actions={actionsNode}
      objects={ops.objects}
      now={now}
      initialSelected={selected ?? null}
      tabs={tabs}
      empty={<OperationsEmpty kind={kind} />}
    />
  );
}
