#!/bin/sh
# Старт контейнера: миграции обеих баз → (DEMO_SEED=1) демо-данные в фоне → сервер.
# Seed пишет только в демо-базу (проверка конфигурации и метки схемы) и не блокирует healthcheck.
set -e
npx tsx scripts/db-modes.ts migrate
if [ "$DEMO_SEED" = "1" ]; then
  npm run seed:demo &
fi
exec npx next start -p "${PORT:-3000}"
