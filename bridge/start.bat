@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DeoVR-Stremio Bridge (fermer cette fenetre pour arreter)
:boucle
node server.js
rem code 2 = impossible de demarrer (port deja pris...) : inutile de recommencer
if %errorlevel%==2 goto fin
echo.
echo [%date% %time%] Le pont s'est arrete (code %errorlevel%). Redemarrage dans 5 secondes... (ferme la fenetre pour arreter)
timeout /t 5 /nobreak >nul
goto boucle
:fin
echo.
pause
