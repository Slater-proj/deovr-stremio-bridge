@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set DEBUG=1
DeoVR-Stremio-Bridge.exe --diagnose --no-pause %*
echo.
echo Fichiers produits dans data\ : diagnostic-report.txt (et debug.log). Relis-les avant de les partager.
pause
