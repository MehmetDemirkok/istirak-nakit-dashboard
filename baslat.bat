@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Istirak Nakit Akis Dashboard
echo  Lokal: http://127.0.0.1:5173
echo  Veriler bu bilgisayarda kalir.
echo.
if not exist node_modules (
  echo Bagimliliklar yukleniyor...
  call npm install
)
start "" http://127.0.0.1:5173
call npm run dev
