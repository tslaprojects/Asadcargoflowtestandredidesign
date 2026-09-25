import type { Metadata } from "next";
import { PageHeader } from "@/components/common/misc";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/features/admin/admin-actions";
import { pageActorWith } from "@/server/page-context";
import { getSettings } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Настройки платформы" };

export default async function AdminSettings() {
  await pageActorWith("ADMIN_SETTINGS");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Настройки платформы" description="Изменения фиксируются в журнале аудита." />
      <Card>
        <CardContent className="pt-5">
          <SettingsForm initial={settings} />
        </CardContent>
      </Card>
    </>
  );
}
