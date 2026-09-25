import type { Metadata } from "next";
import { PageHeader } from "@/components/common/misc";
import { CompanyCreateForm } from "@/features/company/company-forms";

export const metadata: Metadata = { title: "Новая компания" };

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader title="Создать компанию" description="Вы станете руководителем компании и сможете пригласить сотрудников." />
      <CompanyCreateForm />
    </>
  );
}
