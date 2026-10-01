import Link from "next/link";
import { Logo } from "@/components/layout/app-shell";

/** Схема маршрутной сети (декор): узлы — города коридора Китай — Казахстан — Россия, линии — рейсы. */
function RouteNetwork() {
  const nodes: [number, number][] = [
    [70, 250],
    [190, 190],
    [300, 230],
    [410, 150],
    [520, 210],
    [600, 110],
    [250, 320],
    [470, 300],
  ];
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [2, 6],
    [6, 7],
    [7, 4],
    [1, 3],
  ];
  return (
    <svg viewBox="0 0 660 380" className="pointer-events-none w-full max-w-lg opacity-75" aria-hidden>
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a][0]}
          y1={nodes[a][1]}
          x2={nodes[b][0]}
          y2={nodes[b][1]}
          stroke="var(--sidebar-accent)"
          strokeOpacity={i % 3 === 0 ? 0.55 : 0.22}
          strokeWidth={i % 3 === 0 ? 1.6 : 1}
          strokeDasharray={i % 3 === 0 ? undefined : "3 5"}
        />
      ))}
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i % 3 === 0 ? 9 : 6} fill="var(--sidebar-accent)" fillOpacity={0.12} />
          <circle cx={x} cy={y} r={2.6} fill="var(--sidebar-accent)" />
        </g>
      ))}
    </svg>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="bg-sidebar relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <Link href="/login" className="relative w-fit">
          <Logo dark />
        </Link>
        <RouteNetwork />
        <div className="relative max-w-md space-y-4">
          <p className="text-sidebar-accent text-xs font-semibold tracking-[0.12em] uppercase">Transportation OS</p>
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Центр управления международными грузоперевозками</h2>
          <ul className="text-sidebar-foreground space-y-2 text-sm">
            <li>Живая карта операций: рейсы, машины, задержки и прибытия</li>
            <li>Груз → маршрут → машина → водитель → документы → оплата в одной цепочке</li>
            <li>Биржа, торги, договор и электронное подписание</li>
            <li>Командная строка ⌘K — любой объект за секунды</li>
          </ul>
        </div>
        <p className="text-sidebar-muted relative text-xs">Китай · Казахстан · Россия · Центральная Азия</p>
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
