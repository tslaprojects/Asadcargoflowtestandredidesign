# Production-образ CargoFlow (Next.js + Prisma). Миграции: npx prisma migrate deploy
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Сборке нужен только факт наличия DATABASE_URL (подключения к БД при сборке нет).
# Railway/Docker передают переменные сервиса в сборку через ARG; в финальный образ они не попадают.
ARG DATABASE_URL
# 1 — показывать на странице входа кнопки демо-аккаунтов (значение встраивается при сборке).
ARG NEXT_PUBLIC_SHOW_DEMO
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app ./
RUN mkdir -p /app/storage /app/.next/cache && chown -R app:app /app/storage /app/.next/cache
USER app
EXPOSE 3000
# Миграции → (только при DEMO_SEED=1 и пустой базе) демо-данные → сервер. PORT задаёт хостинг, по умолчанию 3000.
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/demo-seed-if-empty.mjs && npx next start -p ${PORT:-3000}"]
