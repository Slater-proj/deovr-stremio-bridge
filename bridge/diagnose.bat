@echo off
cd /d "%~dp0"
set DEBUG=1
node diagnose.js %*
echo.
echo Joignez diagnostic-report.txt (et debug.log si demande) a votre demande d'aide. Relisez-les avant de les partager.
pause
