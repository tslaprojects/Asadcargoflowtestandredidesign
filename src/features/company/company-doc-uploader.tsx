"use client";
import { DocumentUploader } from "@/features/documents/document-uploader";

/** Загрузка документов компании для верификации. */
export function CompanyDocUploaderClient({ companyId }: { companyId: string }) {
  return (
    <DocumentUploader
      url={`/api/companies/${companyId}/documents`}
      types={["REGISTRATION", "TAX", "LICENSE", "OTHER"]}
      labelEnum="CompanyDocumentType"
    />
  );
}
