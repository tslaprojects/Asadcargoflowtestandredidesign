/** Короткий переход между страницами (fade + 4 px, 220 мс); при reduced motion — без анимации. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition h-full">{children}</div>;
}
