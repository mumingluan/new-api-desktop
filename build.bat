@echo off
setlocal
cd /d "%~dp0"

echo New-API-Desktop build
echo.
echo Before continuing, build the latest frontend in the new-api repository:
echo   cd D:\path\to\new-api\web
echo   bun install --frozen-lockfile
echo   set VITE_LANDING_PAGE_VARIANT=xuancat ^&^& bun run build
echo   set VITE_LANDING_PAGE_VARIANT=default ^&^& bun run build
echo.
echo Then copy both build outputs:
echo   web\xuancat\dist  ^<-  Xuancat build
echo   web\default\dist  ^<-  Default build
echo.
choice /C YN /N /M "Has the latest frontend been copied? [Y/N] "
if errorlevel 2 (
  echo Build cancelled.
  exit /b 0
)

if not exist "web\default\dist\index.html" (
  echo Error: web\default\dist\index.html was not found.
  echo Build and copy the latest new-api frontend first.
  exit /b 1
)
if not exist "web\xuancat\dist\index.html" (
  echo Error: web\xuancat\dist\index.html was not found.
  echo Build and copy the Xuancat frontend first.
  exit /b 1
)

echo.
echo [1/3] Installing desktop dependencies...
call npm ci
if errorlevel 1 goto :error

echo.
echo [2/3] Building the Classic frontend...
call npm run build:classic
if errorlevel 1 goto :error

if not exist "web\classic\dist\index.html" (
  echo Error: Classic frontend build output was not created.
  exit /b 1
)

echo.
echo [3/3] Packaging New-API-Desktop for Windows...
call npm run build:win
if errorlevel 1 goto :error

echo.
echo Build complete. Artifacts are in dist\.
exit /b 0

:error
echo.
echo Build failed.
exit /b 1
