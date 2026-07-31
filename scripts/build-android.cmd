@echo off
setlocal
cd /d "%~dp0\.."

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" (
  echo Error: Android SDK was not found at "%ANDROID_HOME%".
  exit /b 1
)

if not defined NDK_HOME set "NDK_HOME=%ANDROID_HOME%\ndk\27.0.12077973"
if not exist "%NDK_HOME%" (
  echo Error: Android NDK 27.0.12077973 was not found at "%NDK_HOME%".
  exit /b 1
)
set "ANDROID_NDK_HOME=%NDK_HOME%"

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

call node scripts\configure-android.js
if errorlevel 1 exit /b %errorlevel%
call npm run prepare:tauri-assets
if errorlevel 1 exit /b %errorlevel%
call npx tauri android build --debug --apk --target aarch64 --ci %*
exit /b %errorlevel%
