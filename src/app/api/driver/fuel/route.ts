import { parseJson, route } from "@/lib/api/handler";
import { driverFuelPurchaseSchema } from "@/lib/validation/fuel";
import { driverFuelView } from "@/server/services/fuel-report.service";
import { driverRegisterRefuel } from "@/server/services/fuel-transaction.service";

/** Водитель: своя машина, своя карта, свои заправки — без баланса компании. */
export const GET = route({}, async ({ actor }) => driverFuelView(actor));

/** Регистрация заправки водителем (демо-карта). */
export const POST = route({ status: 201, idempotency: "fuel.driver.refuel", rateLimit: "critical" }, async ({ req, actor }) =>
  driverRegisterRefuel(actor, await parseJson(req, driverFuelPurchaseSchema)),
);
