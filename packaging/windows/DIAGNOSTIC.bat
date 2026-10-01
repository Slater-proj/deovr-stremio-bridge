@echo off
chcp 65001 >nul
cd /d "%~dp0"
set DEBUG=1
DeoVR-Stremio-Bridge.exe --diagnose --no-pause %*
echo.
echo Joins data\diagnostic-report.txt (et data\debug.log si demande) a ta demande d'aide. Relis-les avant de les partager.
pause
