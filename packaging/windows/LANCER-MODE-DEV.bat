@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DeoVR-Stremio Bridge - MODE DEVELOPPEUR
echo Mode developpeur : journaux detailles dans cette fenetre et dans data\bridge-debug.log
echo Page des outils : http://localhost:8080/dev
echo.
DeoVR-Stremio-Bridge.exe --dev %*
echo.
echo Le pont s'est arrete. Lance RAPPORT-SUPPORT.bat pour preparer le fichier a me transmettre.
pause
