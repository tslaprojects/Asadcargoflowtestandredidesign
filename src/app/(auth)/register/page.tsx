import type { Metadata } from "next";
import { COUNTRIES } from "@/lib/geo/countries";
import { getInvitePreview } from "@/server/services/auth.service";
import { RegisterWizard } from "@/features/auth/register-wizard";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const preview = invite ? await getInvitePreview(invite) : null;
  return (
    <RegisterWizard
      countries={COUNTRIES.map((c) => ({ code: c.code, name: `${c.flag} ${c.name}` }))}
      invite={
        preview && invite
          ? {
              token: invite,
              email: preview.email,
              role: preview.role,
              companyName: preview.company.legalName,
              companyType: preview.company.type,
            }
          : null
      }
    />
  );
}
