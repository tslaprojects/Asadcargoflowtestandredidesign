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
# Миграции обеих баз (REAL и DEMO) → сервер сразу (healthcheck). Демо-данные (только DEMO_SEED=1) грузятся
# в фоне и только в демо-базу. PORT задаёт хостинг, по умолчанию 3000. См. docs/DATABASE_MODES.md.
CMD ["sh", "scripts/docker-start.sh"]
