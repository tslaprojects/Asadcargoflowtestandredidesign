# CargoFlow: установка всего необходимого и запуск (Windows 10/11)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
function Say($m) { Write-Host "[cargoflow] $m" -ForegroundColor Cyan }

function Test-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $v = (node -v).TrimStart("v").Split(".")
  return ([int]$v[0] -gt 20) -or ([int]$v[0] -eq 20 -and [int]$v[1] -ge 9)
}

if (-not (Test-Node)) {
  Say "Node.js не найден — устанавливаю Node.js LTS через winget..."
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget недоступен. Установите Node.js LTS вручную: https://nodejs.org и запустите файл снова." -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"; exit 1
  }
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Test-Node)) { Write-Host "Перезапустите этот файл, чтобы применился новый PATH." -ForegroundColor Yellow; Read-Host "Enter"; exit 1 }
}
Say "Node.js $(node -v)"

if (-not (Test-Path "node_modules")) {
  Say "Установка зависимостей (первый раз 1–3 минуты)..."
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Read-Host "Ошибка установки. Enter"; exit 1 }
}

$envFile = ".env"
if (-not (Test-Path $envFile) -or -not (Select-String -Path $envFile -Pattern '^LOCAL_SETUP_DONE="1"' -Quiet)) {
  npm run setup
  if ($LASTEXITCODE -ne 0) { Read-Host "Ошибка настройки. Enter"; exit 1 }
  Add-Content $envFile 'LOCAL_SETUP_DONE="1"'
}

Start-Job { Start-Sleep 12; Start-Process "http://localhost:3000" } | Out-Null
npm run local
