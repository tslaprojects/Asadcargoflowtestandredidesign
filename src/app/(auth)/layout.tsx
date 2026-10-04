import Link from "next/link";
import { Logo } from "@/components/layout/app-shell";

/** Экран входа, как окно Apple ID: одна колонка по центру на сером фоне, без декоративных панелей. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <main className="flex flex-1 justify-center px-4 py-10 sm:items-center sm:py-14">
        <div className="w-full max-w-[25rem]">
          <Link href="/login" className="mx-auto mb-6 flex w-fit rounded-sm" aria-label="CargoFlow">
            <Logo compact className="[&>span:first-child]:size-14 [&>span:first-child>svg]:size-9" />
          </Link>
          {children}
        </div>
      </main>
      <footer className="text-footnote text-tertiary-foreground px-4 pb-6 text-center">
        Китай · Казахстан · Россия · Центральная Азия
      </footer>
    </div>
  );
}
