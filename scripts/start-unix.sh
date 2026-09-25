#!/usr/bin/env bash
# CargoFlow: установка всего необходимого и запуск (macOS / Linux).
set -euo pipefail
cd "$(dirname "$0")/.."
say() { printf "\033[36m[cargoflow]\033[0m %s\n" "$1"; }

need_node() {
  command -v node >/dev/null 2>&1 || return 0
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?1:0)'
}

if need_node; then
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    say "Node.js не найден — устанавливаю nvm и Node.js 22 LTS (в домашнюю папку, без прав администратора)..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 22 >/dev/null
  nvm use 22 >/dev/null
fi
say "Node.js $(node -v)"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  say "Установка зависимостей (первый раз 1–3 минуты)..."
  npm install --no-audit --no-fund
fi

if [ ! -f .env ] || ! grep -q '^LOCAL_SETUP_DONE="1"' .env; then
  npm run setup
  echo 'LOCAL_SETUP_DONE="1"' >> .env
fi

( sleep 12
  if command -v open >/dev/null 2>&1; then open http://localhost:3000; elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000 >/dev/null 2>&1; fi
) &
npm run local
