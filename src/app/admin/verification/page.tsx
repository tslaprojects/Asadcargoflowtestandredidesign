import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countryName } from "@/lib/geo/countries";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { CompanyDecisionButtons } from "@/features/admin/admin-actions";
import { DocumentList } from "@/features/documents/document-list";
import { pageActorWith } from "@/server/page-context";
import { adminVerificationQueue } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Верификация" };

export default async function AdminVerification() {
  const actor = await pageActorWith("ADMIN_VERIFICATION");
  const queue = toPlain(await adminVerificationQueue(actor));
  return (
    <>
      <PageHeader title="Верификация компаний" description={`Заявок на рассмотрении: ${queue.length}`} />
      {queue.length === 0 ? (
        <EmptyState title="Нет заявок на проверку" />
      ) : (
        <div className="space-y-4">
          {queue.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    <Link href={`/admin/companies/${r.company.id}`} className="hover:underline">
                      {r.company.legalName}
                    </Link>
                  </CardTitle>
                  <p className="text-muted-foreground text-body">
                    {label("CompanyType", r.company.type)} · {countryName(r.company.country)}, {r.company.city} · рег. №{" "}
                    {r.company.registrationNumber} · подана {formatDateTime(r.createdAt)}
                  </p>
                  {r.comment && <p className="text-body mt-1">«{r.comment}»</p>}
                </div>
                <CompanyDecisionButtons companyId={r.company.id} status={r.company.verificationStatus} />
              </CardHeader>
              <CardContent>
                <DocumentList
                  docs={r.documents.map((d) => ({
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
          ))}
        </div>
      )}
    </>
  );
}
