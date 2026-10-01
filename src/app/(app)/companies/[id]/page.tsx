import { Star } from "lucide-react";
import type { Metadata } from "next";
import { DefinitionList, PageHeader, RatingInline } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryName } from "@/lib/geo/countries";
import { formatDate } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { guard, pageActor } from "@/server/page-context";
import { getPublicCompany } from "@/server/services/company.service";

export const metadata: Metadata = { title: "Компания" };

export default async function PublicCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pageActor();
  const { company, rating, reviews, completed } = toPlain(await guard(getPublicCompany(id)));
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {company.legalName} <StatusBadge kind="VerificationStatus" value={company.verificationStatus} size="lg" />
          </span>
        }
        description={`${label("CompanyType", company.type)} · ${countryName(company.country)}, ${company.city}`}
      />
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>О компании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold">{rating?.average?.toFixed(1) ?? "—"}</span>
              <RatingInline value={rating?.average ?? null} count={rating?.count ?? 0} />
            </div>
            <DefinitionList
              className="sm:grid-cols-1"
              items={[
                { label: "Пунктуальность", value: rating?.punctuality ?? "—" },
                { label: "Коммуникация", value: rating?.communication ?? "—" },
                { label: "Документы", value: rating?.documentation ?? "—" },
                { label: "Завершённых перевозок", value: completed },
                ...(company.type === "CARRIER" ? [{ label: "Автомобилей", value: company._count.vehicles }] : []),
                { label: "На платформе с", value: formatDate(company.createdAt) },
                ...(company.website ? [{ label: "Сайт", value: company.website }] : []),
              ]}
            />
            {company.description && <p className="text-muted-foreground text-sm">{company.description}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Отзывы ({reviews.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {reviews.length === 0 ? (
              <p className="text-muted-foreground text-sm">Отзывов пока нет.</p>
            ) : (
              <ul className="divide-border divide-y">
                {reviews.map((r) => (
                  <li key={r.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex" aria-label={`Оценка ${r.rating} из 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={n <= r.rating ? "fill-rating text-rating size-4" : "text-border-strong size-4"}
                            aria-hidden
                          />
                        ))}
                      </span>
                      <span className="font-medium">{r.fromCompany.legalName}</span>
                      <span className="text-muted-foreground">
                        · {r.order.publicNumber} · {formatDate(r.createdAt)}
                      </span>
                    </div>
                    {r.comment && <p className="mt-1">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
