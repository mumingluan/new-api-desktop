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

if not exist "src-tauri\gen\android\gradle.properties" (
  call npx tauri android init
  if errorlevel 1 exit /b %errorlevel%
)
call node scripts\configure-android.js
if errorlevel 1 exit /b %errorlevel%
call npm run prepare:tauri-assets
if errorlevel 1 exit /b %errorlevel%
call npx tauri android build --apk --target aarch64 --split-per-abi --ci %*
if errorlevel 1 exit /b %errorlevel%

set "UNSIGNED_APK=src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release-unsigned.apk"
set "SIGNED_APK=src-tauri\gen\android\app\build\outputs\apk\arm64\release\New-API-Desktop_1.1.6_arm64-release.apk"
set "DEBUG_KEYSTORE=%USERPROFILE%\.android\debug.keystore"
set "APKSIGNER="
for /f "delims=" %%I in ('dir /b /ad /o-n "%ANDROID_HOME%\build-tools"') do (
  if not defined APKSIGNER if exist "%ANDROID_HOME%\build-tools\%%I\apksigner.bat" set "APKSIGNER=%ANDROID_HOME%\build-tools\%%I\apksigner.bat"
)
if not defined APKSIGNER (
  echo Error: apksigner was not found under "%ANDROID_HOME%\build-tools".
  exit /b 1
)
if not exist "%DEBUG_KEYSTORE%" (
  echo Error: Android debug keystore was not found at "%DEBUG_KEYSTORE%".
  exit /b 1
)
if not exist "%UNSIGNED_APK%" (
  echo Error: Android release APK was not found at "%UNSIGNED_APK%".
  exit /b 1
)

call "%APKSIGNER%" sign --ks "%DEBUG_KEYSTORE%" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "%SIGNED_APK%" "%UNSIGNED_APK%"
if errorlevel 1 exit /b %errorlevel%
call "%APKSIGNER%" verify --verbose --print-certs "%SIGNED_APK%"
if errorlevel 1 exit /b %errorlevel%
echo Signed installable APK: %CD%\%SIGNED_APK%
exit /b 0
