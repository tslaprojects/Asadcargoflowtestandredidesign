import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DefinitionList, PageHeader, RatingInline } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { UrlTabs } from "@/components/common/url-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryName } from "@/lib/geo/countries";
import { formatDate, formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { ROLES_BY_COMPANY_TYPE } from "@/lib/permissions";
import { toPlain } from "@/lib/serialize";
import { AuditFeed, type AuditRow } from "@/features/audit/audit-feed";
import { CompanyDocUploaderClient } from "@/features/company/company-doc-uploader";
import { CompanyEditForm } from "@/features/company/company-forms";
import { MembersPanel } from "@/features/company/members";
import { RequestVerificationButton } from "@/features/company/verification";
import { DocumentList } from "@/features/documents/document-list";
import { guard, pageActor } from "@/server/page-context";
import { getCompanyProfile } from "@/server/services/company.service";

export const metadata: Metadata = { title: "Компания" };

export default async function CompanyPage() {
  const actor = await pageActor();
  if (!actor.active) redirect("/company/new");
  const { company, rating, history, ordersCount } = toPlain(await guard(getCompanyProfile(actor, actor.active.companyId)));
  const canManage = actor.permissions.has("COMPANY_MANAGE");
  const canMembers = actor.permissions.has("COMPANY_MEMBERS_MANAGE");
  const isCarrier = company.type === "CARRIER";
  const initial = {
    legalName: company.legalName,
    tradeName: company.tradeName,
    taxId: company.taxId,
    region: company.region,
    city: company.city,
    address: company.address,
    postalCode: company.postalCode,
    phone: company.phone,
    email: company.email,
    website: company.website,
    description: company.description,
  };
  const verificationBlocked =
    company.verificationStatus === "VERIFIED"
      ? "Компания проверена."
      : company.verificationStatus === "PENDING"
        ? "Заявка на проверку уже на рассмотрении у администратора."
        : company.verificationStatus === "SUSPENDED"
          ? "Деятельность компании приостановлена. Обратитесь к администратору."
          : !canManage
            ? "Отправить компанию на проверку может руководитель."
            : company.documents.length === 0
              ? "Загрузите хотя бы один документ во вкладке «Документы», затем запросите проверку."
              : undefined;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {company.legalName} <StatusBadge kind="VerificationStatus" value={company.verificationStatus} size="lg" />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {label("CompanyType", company.type)} · {countryName(company.country)}, {company.city} · перевозок: {ordersCount}
            {rating && <RatingInline value={rating.average} count={rating.count} />}
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/companies/${company.id}`}>Публичная карточка</Link>
          </Button>
        }
      />
      <UrlTabs
        defaultTab="main"
        tabs={[
          {
            value: "main",
            label: "Основная информация",
            content: (
              <Card>
                <CardContent className="pt-5">
                  <CompanyEditForm companyId={company.id} initial={initial} readOnly={!canManage} />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "requisites",
            label: "Реквизиты",
            content: (
              <Card>
                <CardContent className="pt-5">
                  <DefinitionList
                    items={[
                      { label: "Юридическое название", value: company.legalName },
                      { label: "Регистрационный номер", value: company.registrationNumber },
                      { label: "ИНН / налоговый номер", value: company.taxId ?? "—" },
                      { label: "Страна регистрации", value: countryName(company.country) },
                      {
                        label: "Юридический адрес",
                        value: [company.postalCode, company.region, company.city, company.address].filter(Boolean).join(", "),
                      },
                      { label: "Дата регистрации на платформе", value: formatDate(company.createdAt) },
                    ]}
                  />
                  <p className="text-muted-foreground mt-4 text-xs">
                    Регистрационный номер и страну может изменить только администратор платформы.
                  </p>
                </CardContent>
              </Card>
            ),
          },
          {
            value: "contacts",
            label: "Контакты",
            content: (
              <Card>
                <CardContent className="pt-5">
                  <DefinitionList
                    items={[
                      { label: "Телефон", value: company.phone ?? "—" },
                      { label: "Email", value: company.email ?? "—" },
                      { label: "Сайт", value: company.website ?? "—" },
                      { label: "Адрес", value: `${company.city}, ${company.address}` },
                    ]}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "documents",
            label: "Документы",
            content: (
              <div className="space-y-4">
                <DocumentList
                  docs={company.documents.map((d) => ({
                    ...d,
                    type: "OTHER",
                    version: 1,
                    status: "ACTIVE",
                    note: label("CompanyDocumentType", d.type),
                  }))}
                  downloadBase="/api/company-documents"
                  deleteBase="/api/company-documents"
                />
                {canManage && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Загрузить документ компании</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CompanyDocUploaderClient companyId={company.id} />
                    </CardContent>
                  </Card>
                )}
              </div>
            ),
          },
          {
            value: "members",
            label: `Сотрудники (${company.members.length})`,
            content: (
              <MembersPanel
                companyId={company.id}
                members={company.members}
                invites={company.invites}
                roles={ROLES_BY_COMPANY_TYPE[company.type].filter((r) => r !== "DRIVER")}
                canManage={canMembers}
                currentUserId={actor.userId}
              />
            ),
          },
          {
            value: "vehicles",
            label: "Автомобили",
            hidden: !isCarrier,
            content: (
              <Card>
                <CardContent className="flex items-center justify-between gap-3 pt-5">
                  <p className="text-sm">В автопарке: {company._count.vehicles}</p>
                  <Button asChild variant="outline">
                    <Link href="/vehicles">Открыть автопарк</Link>
                  </Button>
                </CardContent>
              </Card>
            ),
          },
          {
            value: "drivers",
            label: "Водители",
            hidden: !isCarrier,
            content: (
              <Card>
                <CardContent className="flex items-center justify-between gap-3 pt-5">
                  <p className="text-sm">Водителей: {company._count.drivers}</p>
                  <Button asChild variant="outline">
                    <Link href="/drivers">Открыть список водителей</Link>
                  </Button>
                </CardContent>
              </Card>
            ),
          },
          {
            value: "history",
            label: "История",
            content: (
              <Card>
                <CardContent className="pt-4">
                  <AuditFeed rows={history as unknown as AuditRow[]} />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "verification",
            label: "Верификация",
            content: (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Статус проверки</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <StatusBadge kind="VerificationStatus" value={company.verificationStatus} size="lg" />
                    <p className="text-muted-foreground text-sm">
                      Проверенные компании отмечаются значком на бирже и вызывают больше доверия у контрагентов. Для проверки загрузите
                      регистрационный и налоговый документы, лицензии (если применимо).
                    </p>
                    <RequestVerificationButton companyId={company.id} disabledReason={verificationBlocked} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>История проверок</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {company.verificationRequests.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Заявок на проверку ещё не было.</p>
                    ) : (
                      <ul className="space-y-3 text-sm">
                        {company.verificationRequests.map((r) => (
                          <li key={r.id} className="border-border rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span>{formatDateTime(r.createdAt)}</span>
                              <StatusBadge kind="VerificationRequestStatus" value={r.status} />
                            </div>
                            {r.comment && <p className="text-muted-foreground mt-1">Комментарий: {r.comment}</p>}
                            {r.reviewComment && <p className="mt-1">Ответ администратора: {r.reviewComment}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
