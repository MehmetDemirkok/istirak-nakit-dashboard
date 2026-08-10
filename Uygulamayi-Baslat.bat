@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Istirak Nakit Dashboard
echo.
echo  ========================================
echo   Istirak Nakit Akis Dashboard
echo  ========================================
echo.
echo  Veriler bu bilgisayarda kalir.
echo  Adres: http://127.0.0.1:8787
echo.
echo  Kapatmak icin bu pencereyi kapatin.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo Lutfen https://nodejs.org adresinden LTS surumunu kurun.
  echo Kurulumdan sonra bu dosyaya tekrar cift tiklayin.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Ilk kurulum: bagimliliklar yukleniyor...
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo Ilk kurulum: uygulama derleniyor...
  call npm run build
  if errorlevel 1 (
    echo [HATA] Derleme basarisiz.
    pause
    exit /b 1
  )
)

if not exist "dist-server\index.js" (
  echo Sunucu derleniyor...
  call npm run build
  if errorlevel 1 (
    echo [HATA] Derleme basarisiz.
    pause
    exit /b 1
  )
)

start "" "http://127.0.0.1:8787"
call npm start
echo.
echo Uygulama kapandi.
pause
