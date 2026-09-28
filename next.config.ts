import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Next.js App Router встраивает inline-скрипты данных RSC, поэтому script-src
 * допускает 'unsafe-inline' (без nonce), но запрещает сторонние источники скриптов, фреймы и плагины.
 * Картам MapLibre нужны тайлы/стили по https и web worker из blob:.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https:${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Шрифты с кириллицей для PDF договоров должны попасть в серверную сборку
  outputFileTracingIncludes: {
    "/api/contracts/[id]/pdf": ["./assets/fonts/**"],
  },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
