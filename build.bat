@echo off
setlocal
cd /d "%~dp0"

echo New API Desktop - Tauri Windows build
echo.
echo [1/2] Installing locked dependencies...
call npm ci
if errorlevel 1 goto :error

echo.
echo [2/2] Packaging the Tauri application...
call npm run build:win
if errorlevel 1 goto :error

echo.
echo Build complete. Artifacts are in src-tauri\target\release\bundle\nsis\.
exit /b 0

:error
echo.
echo Build failed.
exit /b 1
