import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { label } from "@/lib/i18n";
import { pageActor, sp, type SearchParams } from "@/server/page-context";
import { globalSearch } from "@/server/services/search.service";

export const metadata: Metadata = { title: "Поиск" };

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActor();
  const params = await searchParams;
  const q = (sp(params, "q") ?? "").slice(0, 100);
  const r = await globalSearch(actor, q);
  const empty = r.orders.length + r.loads.length + r.companies.length + r.vehicles.length === 0;
  return (
    <>
      <PageHeader title={`Поиск: «${q}»`} />
      {q.length < 2 ? (
        <EmptyState title="Введите не менее 2 символов" />
      ) : empty ? (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте номер заказа (CF-O-…), груза (CF-L-…), название компании или госномер."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {r.orders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Перевозки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.orders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders/${o.id}`}
                    className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2"
                  >
                    <span>
                      <span className="font-medium">{o.publicNumber}</span>{" "}
                      <span className="text-muted-foreground text-body">
                        {o.load.originCity} → {o.load.destinationCity}
                      </span>
                    </span>
                    <StatusBadge kind="OrderStatus" value={o.currentStatus} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {r.loads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Грузы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.loads.map((l) => (
                  <Link
                    key={l.id}
                    href={`/loads/${l.id}`}
                    className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2"
                  >
                    <span>
                      <span className="font-medium">{l.publicNumber}</span>{" "}
                      <span className="text-muted-foreground text-body">{l.title}</span>
                    </span>
                    <StatusBadge kind="LoadStatus" value={l.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {r.companies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Компании</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.companies.map((c) => (
                  <Link
                    key={c.id}
                    href={`/companies/${c.id}`}
                    className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2"
                  >
                    <span>
                      <span className="font-medium">{c.legalName}</span>{" "}
                      <span className="text-muted-foreground text-body">
                        {label("CompanyType", c.type)} · {c.city}
                      </span>
                    </span>
                    <StatusBadge kind="VerificationStatus" value={c.verificationStatus} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {r.vehicles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Автомобили</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.vehicles.map((v) => (
                  <Link
                    key={v.id}
                    href={`/vehicles?q=${encodeURIComponent(v.plateNumber)}`}
                    className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg p-2"
                  >
                    <span>
                      <span className="font-mono font-medium">{v.plateNumber}</span>{" "}
                      <span className="text-muted-foreground text-body">
                        {v.make} {v.model}
                      </span>
                    </span>
                    <StatusBadge kind="VehicleStatus" value={v.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
