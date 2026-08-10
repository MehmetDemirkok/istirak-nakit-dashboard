@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PROJECT=%CD%"
title Istirak Nakit Dashboard

echo.
echo  ========================================
echo   Istirak Nakit Akis Dashboard
echo  ========================================
echo.
echo  Proje: %PROJECT%
echo  Adres: http://127.0.0.1:8787
echo  Kapatmak icin bu pencereyi kapatin.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js yok.
  echo https://nodejs.org adresinden LTS kurun, sonra bu dosyaya tekrar cift tiklayin.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Kurulum] Bagimliliklar yukleniyor...
  call npm install
  if errorlevel 1 ( echo [HATA] npm install basarisiz. & pause & exit /b 1 )
)

if not exist "dist\index.html" (
  echo [Kurulum] Uygulama derleniyor...
  call npm run build
  if errorlevel 1 ( echo [HATA] Derleme basarisiz. & pause & exit /b 1 )
)
if not exist "dist-server\index.js" (
  echo [Kurulum] Sunucu derleniyor...
  call npm run build
  if errorlevel 1 ( echo [HATA] Derleme basarisiz. & pause & exit /b 1 )
)

REM Masaustu kisayolu (mutlak yol + dogru calisma klasoru)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$lnkPath = Join-Path $desktop 'Istirak Nakit Dashboard.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath);" ^
  "$s.TargetPath = '%PROJECT%\Baslat.bat';" ^
  "$s.WorkingDirectory = '%PROJECT%';" ^
  "$s.WindowStyle = 1;" ^
  "$s.Description = 'Istirak Nakit Akis Dashboard';" ^
  "$s.IconLocation = 'shell32.dll,21';" ^
  "$s.Save()" >nul 2>&1

start "" "http://127.0.0.1:8787"
echo Uygulama baslatiliyor...
echo.
call npm start
echo.
echo Uygulama kapandi.
pause
