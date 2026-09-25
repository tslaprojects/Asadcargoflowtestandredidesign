import Link from "next/link";
import { Logo } from "@/components/layout/app-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="bg-sidebar relative hidden flex-col justify-between p-10 text-white lg:flex">
        <Link href="/login">
          <Logo dark />
        </Link>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl leading-tight font-semibold">Международные грузоперевозки — от заявки до закрытия сделки</h2>
          <ul className="space-y-2 text-slate-300">
            <li>• Биржа грузов и торги с перевозчиками</li>
            <li>• Договор и электронное подписание</li>
            <li>• Назначение машины и водителя, трекинг рейса</li>
            <li>• Документы, чат, финансы и история сделки</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500">Китай · Казахстан · Россия · Центральная Азия</p>
      </div>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
