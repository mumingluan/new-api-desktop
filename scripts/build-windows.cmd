@echo off
setlocal
cd /d "%~dp0\.."

set "VS2022_PATH="
for %%I in (
  "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools"
  "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise"
  "%ProgramFiles%\Microsoft Visual Studio\2022\Professional"
  "%ProgramFiles%\Microsoft Visual Studio\2022\Community"
) do if exist "%%~I\VC\Auxiliary\Build\vcvars64.bat" set "VS2022_PATH=%%~I"
if not defined VS2022_PATH (
  echo Error: Visual Studio 2022 C++ Build Tools were not found.
  exit /b 1
)

call "%VS2022_PATH%\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b %errorlevel%

call npm run prepare:tauri-assets
if errorlevel 1 exit /b %errorlevel%
call npx tauri build --bundles nsis %*
exit /b %errorlevel%
