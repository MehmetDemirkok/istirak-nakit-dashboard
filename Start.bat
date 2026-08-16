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
echo  Project: %PROJECT%
echo  Address: http://127.0.0.1:8787
echo  Data:    %PROJECT%\data
echo  Close this window to stop the app.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Install LTS from https://nodejs.org, then double-click this file again.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Setup] Installing dependencies...
  call npm install
  if errorlevel 1 ( echo [ERROR] npm install failed. & pause & exit /b 1 )
)

if not exist "dist\index.html" (
  echo [Setup] Building the app...
  call npm run build
  if errorlevel 1 ( echo [ERROR] Build failed. & pause & exit /b 1 )
)
if not exist "dist-server\index.js" (
  echo [Setup] Building the server...
  call npm run build
  if errorlevel 1 ( echo [ERROR] Build failed. & pause & exit /b 1 )
)

REM Desktop shortcut (absolute path + working directory)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$lnkPath = Join-Path $desktop 'Istirak Nakit Dashboard.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath);" ^
  "$s.TargetPath = '%PROJECT%\Start.bat';" ^
  "$s.WorkingDirectory = '%PROJECT%';" ^
  "$s.WindowStyle = 1;" ^
  "$s.Description = 'Istirak Nakit Akis Dashboard';" ^
  "$s.IconLocation = 'shell32.dll,21';" ^
  "$s.Save()" >nul 2>&1

start "" "http://127.0.0.1:8787"
echo Starting the app...
echo.
call npm start
echo.
echo App stopped.
pause
