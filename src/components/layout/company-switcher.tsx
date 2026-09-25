"use client";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientActor } from "@/lib/auth/actor";
import { api, errorMessage } from "@/lib/client/api";
import { label } from "@/lib/i18n";

export function CompanySwitcher({ actor }: { actor: ClientActor }) {
  const router = useRouter();
  const active = actor.active;
  const switchTo = async (companyId: string) => {
    if (companyId === active?.companyId) return;
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/switch-company", { body: { companyId } });
      toast.success("Компания переключена");
      router.push(res.redirectTo);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="border-border hover:bg-muted flex max-w-[200px] items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm"
        aria-label="Текущая компания"
      >
        <Building2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate leading-tight font-medium">{active?.company.legalName ?? "Нет компании"}</span>
          <span className="text-muted-foreground block truncate text-xs leading-tight">
            {active ? label("MemberRole", active.role) : ""}
          </span>
        </span>
        {actor.memberships.length > 1 && <ChevronsUpDown className="text-muted-foreground size-3.5" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{actor.memberships.length > 1 ? "Сменить компанию" : "Компания"}</DropdownMenuLabel>
        {actor.memberships.map((m) => (
          <DropdownMenuItem key={m.companyId} onSelect={() => switchTo(m.companyId)}>
            <span className="flex-1">
              <span className="block font-medium">{m.company.legalName}</span>
              <span className="text-muted-foreground block text-xs">{label("MemberRole", m.role)}</span>
            </span>
            {m.companyId === active?.companyId && <Check className="!text-primary" aria-label="Текущая" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/company/new")}>
          <Building2 /> Создать ещё одну компанию
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
