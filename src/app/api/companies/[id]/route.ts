import { permissionsInCompany } from "@/lib/auth/actor";
import { parseJson, route } from "@/lib/api/handler";
import { companyUpdateSchema } from "@/lib/validation/company";
import { getCompanyProfile, getPublicCompany, updateCompany } from "@/server/services/company.service";

export const GET = route<{ id: string }>({}, async ({ actor, params }) => {
  const canViewProfile = permissionsInCompany(actor, params.id).has("COMPANY_VIEW");
  return canViewProfile ? getCompanyProfile(actor, params.id) : getPublicCompany(params.id);
});

export const PATCH = route<{ id: string }>({}, async ({ req, actor, params }) =>
  updateCompany(actor, params.id, await parseJson(req, companyUpdateSchema)),
);
