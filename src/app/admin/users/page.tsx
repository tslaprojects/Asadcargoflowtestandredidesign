import type { Metadata } from "next";
import { DataTable } from "@/components/common/data-table";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate, formatRelative } from "@/lib/format";
import { label } from "@/lib/i18n";
import { toPlain } from "@/lib/serialize";
import { pageActorWith, pageNum, sp, type SearchParams } from "@/server/page-context";
import { adminListUsers } from "@/server/services/admin.service";

export const metadata: Metadata = { title: "Пользователи" };

export default async function AdminUsers({ searchParams }: { searchParams: SearchParams }) {
  const actor = await pageActorWith("ADMIN_USERS");
  const params = await searchParams;
  const status = sp(params, "status");
  const data = toPlain(
    await adminListUsers(actor, {
      q: sp(params, "q"),
      status: status === "ACTIVE" || status === "BLOCKED" ? status : undefined,
      page: pageNum(params),
      pageSize: 25,
    }),
  );
  type Row = (typeof data.items)[number];
  return (
    <>
      <PageHeader title="Пользователи" description={`Всего: ${data.total}`} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: "Email, имя, телефон" },
          {
            type: "select",
            name: "status",
            label: "Статус",
            options: [
              { value: "ACTIVE", label: "Активен" },
              { value: "BLOCKED", label: "Заблокирован" },
            ],
          },
        ]}
      />
      <DataTable<Row>
        rows={data.items}
        rowKey={(u) => u.id}
        rowHref={(u) => `/admin/users/${u.id}`}
        columns={[
          { key: "name", header: "Пользователь", primary: true, cell: (u) => `${u.firstName} ${u.lastName}` },
          { key: "email", header: "Email", cell: (u) => u.email },
          {
            key: "companies",
            header: "Компании",
            cell: (u) =>
              u.memberships.map((m) => `${m.company.legalName} (${label("MemberRole", m.role)})`).join(", ") ||
              (u.platformRole === "PLATFORM_ADMIN" ? "Администратор" : "—"),
          },
          { key: "status", header: "Статус", cell: (u) => <StatusBadge kind="UserStatus" value={u.status} /> },
          {
            key: "login",
            header: "Последний вход",
            cell: (u) => (u.lastLoginAt ? formatRelative(u.lastLoginAt) : "—"),
            hideOnMobile: true,
          },
          { key: "created", header: "Регистрация", cell: (u) => formatDate(u.createdAt), hideOnMobile: true },
        ]}
      />
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} basePath="/admin/users" searchParams={params} />
    </>
  );
}
