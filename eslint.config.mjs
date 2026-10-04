import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // После входа/выхода/смены компании намеренно выполняется полная перезагрузка страницы,
      // чтобы серверные компоненты отрисовались с новой сессией.
      "@next/next/no-location-assign-relative-destination": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
    "public/maplibre/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
