import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;
