/** Переход между страницами — короткое проявление (180 мс); при reduced motion — без анимации. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition h-full">{children}</div>;
}
