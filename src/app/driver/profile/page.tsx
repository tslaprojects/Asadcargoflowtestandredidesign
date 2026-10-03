import type { Metadata } from "next";
import { InsetGroup, InsetList, ListRow } from "@/components/common/inset-group";
import { StatusBadge } from "@/components/common/status-badge";
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
    <div className="space-y-6 pt-2">
      <h1 className="text-large-title">Профиль</h1>
      <InsetGroup header={actor.fullName}>
        <InsetList>
          <ListRow title="Email" value={actor.email} />
          <ListRow title="Телефон" value={actor.phone ?? "—"} />
        </InsetList>
      </InsetGroup>
      {profiles.map((p) => (
        <InsetGroup key={p.id} header={p.company.legalName} action={<StatusBadge kind="DriverStatus" value={p.status} />}>
          <InsetList>
            <ListRow title="Водительское удостоверение" value={p.licenseNumber} />
            <ListRow title="Категория" value={p.licenseCategory} />
            <ListRow title="Действует до" value={<span className="num">{formatDate(p.licenseExpiry)}</span>} />
            <ListRow
              title="Телефон диспетчерской"
              value={
                p.company.phone ? (
                  <a className="text-link" href={`tel:${p.company.phone}`}>
                    {p.company.phone}
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </InsetList>
        </InsetGroup>
      ))}
      <LogoutButton />
    </div>
  );
}
