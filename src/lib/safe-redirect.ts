/**
 * Безопасный путь для перехода после входа: только относительный путь этого же сайта.
 * Отсекает `//evil.com`, `/\evil.com`, `https://…`, `javascript:` и управляющие символы.
 */
export function safeRedirectPath(next: string | null | undefined, origin = "http://localhost"): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return null;
  try {
    const base = new URL(origin);
    const url = new URL(next, base);
    if (url.origin !== base.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
