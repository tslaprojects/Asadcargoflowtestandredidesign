import { parseQuery, route } from "@/lib/api/handler";
import { companyAdminListSchema } from "@/lib/validation/company";
import { adminListCompanies } from "@/server/services/admin.service";

export const GET = route({}, async ({ req, actor }) => adminListCompanies(actor, parseQuery(req, companyAdminListSchema)));
