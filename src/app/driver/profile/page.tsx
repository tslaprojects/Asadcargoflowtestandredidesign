import type { Metadata } from "next";
import { DefinitionList } from "@/components/common/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { toPlain } from "@/lib/serialize";
import { LogoutButton } from "@/features/auth/logout-button";
import { pageActor } from "@/server/page-context";
import { getMyDriverProfile } from "@/server/services/driver-trip.service";

export const metadata: Metadata = { title: "Профиль водителя" };

export default async function DriverProfilePage() {
  const actor = await pageActor();
  const profiles = toPlain(await getMyDriverProfile(actor));
  return (
    <div className="space-y-4 pt-1">
      <h1 className="text-title1 font-semibold">Профиль</h1>
      <Card>
        <CardHeader>
          <CardTitle>{actor.fullName}</CardTitle>
        </CardHeader>
        <CardContent>
          <DefinitionList
            items={[
              { label: "Email", value: actor.email },
              { label: "Телефон", value: actor.phone ?? "—" },
            ]}
          />
        </CardContent>
      </Card>
      {profiles.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{p.company.legalName}</CardTitle>
            <StatusBadge kind="DriverStatus" value={p.status} />
          </CardHeader>
          <CardContent>
            <DefinitionList
              items={[
                { label: "Водительское удостоверение", value: p.licenseNumber },
                { label: "Категория", value: p.licenseCategory },
                { label: "Действует до", value: formatDate(p.licenseExpiry) },
                {
                  label: "Телефон диспетчерской",
                  value: p.company.phone ? (
                    <a className="text-link" href={`tel:${p.company.phone}`}>
                      {p.company.phone}
                    </a>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      ))}
      <LogoutButton />
    </div>
  );
}
