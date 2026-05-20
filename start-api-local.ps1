$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$venv = Join-Path $backend ".venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    Write-Host "Creando entorno virtual..."
    py -3 -m venv $venv
}

Write-Host "Instalando dependencias..."
& $python -m pip install -r (Join-Path $backend "requirements.txt")

Write-Host ""
Write-Host "API local lista en http://localhost:8000"
Write-Host "Deja esta ventana abierta mientras uses el dashboard de GitHub Pages."
Write-Host ""

Set-Location $backend
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
