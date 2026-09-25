import type { Metadata } from "next";
import { DefinitionList, PageHeader, RatingInline } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryName } from "@/lib/geo/countries";
import { formatDate, formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { AuditFeed, type AuditRow } from "@/features/audit/audit-feed";
import { CompanyDecisionButtons } from "@/features/admin/admin-actions";
import { DocumentList } from "@/features/documents/document-list";
import { guard, pageActorWith } from "@/server/page-context";
import { getCompanyProfile } from "@/server/services/company.service";

export const metadata: Metadata = { title: "Компания" };

export default async function AdminCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActorWith("ADMIN_COMPANIES");
  const { company, rating, history, ordersCount } = toPlain(await guard(getCompanyProfile(actor, id)));
  return (
    <>
      <PageHeader
        back={{ href: "/admin/companies", label: "Компании" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {company.legalName} <StatusBadge kind="VerificationStatus" value={company.verificationStatus} size="lg" />
          </span>
        }
        description={`${label("CompanyType", company.type)} · ${countryName(company.country)}, ${company.city}`}
        actions={<CompanyDecisionButtons companyId={company.id} status={company.verificationStatus} />}
      />
      {company.suspendReason && (
        <p className="bg-danger-bg text-danger mb-4 rounded-lg px-3 py-2 text-sm">Приостановлена: {company.suspendReason}</p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Реквизиты</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              items={[
                { label: "Регистрационный номер", value: company.registrationNumber },
                { label: "ИНН", value: company.taxId ?? "—" },
                { label: "Адрес", value: `${company.city}, ${company.address}` },
                { label: "Контакты", value: [company.phone, company.email].filter(Boolean).join(", ") || "—" },
                { label: "Создана", value: formatDate(company.createdAt) },
                { label: "Перевозок", value: ordersCount },
                { label: "Рейтинг", value: <RatingInline value={rating?.average ?? null} count={rating?.count ?? 0} /> },
                { label: "Автомобили / водители", value: `${company._count.vehicles} / ${company._count.drivers}` },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Сотрудники ({company.members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {company.members.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>
                    {m.user.firstName} {m.user.lastName} · {m.user.email}
                  </span>
                  <span className="text-muted-foreground">{label("MemberRole", m.role)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Документы компании</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentList
              docs={company.documents.map((d) => ({
                ...d,
                type: "OTHER",
                version: 1,
                status: "ACTIVE",
                note: label("CompanyDocumentType", d.type),
              }))}
              downloadBase="/api/company-documents"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>История проверок</CardTitle>
          </CardHeader>
          <CardContent>
            {company.verificationRequests.length === 0 ? (
              <p className="text-muted-foreground text-sm">Заявок не было</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {company.verificationRequests.map((r) => (
                  <li key={r.id} className="border-border rounded-lg border p-2">
                    <div className="flex justify-between">
                      <span>{formatDateTime(r.createdAt)}</span>
                      <StatusBadge kind="VerificationRequestStatus" value={r.status} />
                    </div>
                    {r.comment && <p className="text-muted-foreground">Компания: {r.comment}</p>}
                    {r.reviewComment && <p>Решение: {r.reviewComment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>История</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditFeed rows={history as unknown as AuditRow[]} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
