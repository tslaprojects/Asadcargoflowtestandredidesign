import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/misc";
import { toPlain } from "@/lib/serialize";
import { LoadWizard } from "@/features/loads/load-wizard";
import { loadToWizardValues } from "@/features/loads/wizard-values";
import { guard, pageActorWith } from "@/server/page-context";
import { EDITABLE_LOAD_STATUSES, getLoadForEdit, listCarrierOptions } from "@/server/services/load.service";

export const metadata: Metadata = { title: "Редактирование груза" };

export default async function EditLoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await pageActorWith("LOAD_EDIT");
  const load = toPlain(await guard(getLoadForEdit(actor, id)));
  if (!EDITABLE_LOAD_STATUSES.includes(load.status)) redirect(`/loads/${id}`);
  const carriers = await listCarrierOptions();
  return (
    <>
      <PageHeader title={`Редактирование ${load.publicNumber}`} back={{ href: `/loads/${id}`, label: "К грузу" }} />
      <LoadWizard
        mode="edit"
        loadId={id}
        loadStatus={load.status}
        initial={loadToWizardValues(load as unknown as Parameters<typeof loadToWizardValues>[0])}
        carriers={carriers}
        isForwarder={actor.active?.role === "FORWARDER"}
      />
    </>
  );
}
