@echo off
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$target = Join-Path '%~dp0' 'Uygulamayi-Baslat.bat';" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$lnkPath = Join-Path $desktop 'Istirak Nakit Dashboard.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath);" ^
  "$s.TargetPath = $target;" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 1;" ^
  "$s.Description = 'Istirak Nakit Akis Dashboard';" ^
  "$s.IconLocation = 'shell32.dll,21';" ^
  "$s.Save();" ^
  "Write-Host ('OK: ' + $lnkPath)"

if errorlevel 1 (
  echo [HATA] Kisayol olusturulamadi.
  pause
  exit /b 1
)

echo.
echo Masaustunde "Istirak Nakit Dashboard" kisayolu hazir.
echo Cift tiklayarak uygulamayi acabilirsiniz.
echo.
pause
