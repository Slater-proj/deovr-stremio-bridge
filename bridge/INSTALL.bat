@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Installation DeoVR-Stremio Bridge ===
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Tentative d'installation automatique...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Ferme cette fenetre et relance INSTALL.bat pour que Node.js soit pris en compte.
  echo Si ca ne marche pas, installe Node.js LTS depuis https://nodejs.org puis relance.
  pause
  exit /b
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo.
  echo ffmpeg absent : il sert a convertir les films MKV en flux lisible par DeoVR Windows. Installation...
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  echo Si ffmpeg vient d'etre installe, ferme puis relance start.bat pour qu'il soit pris en compte.
)
echo.
echo Premiere utilisation : lance start.bat. Ton navigateur s'ouvrira sur la page de connexion Stremio
echo (le mot de passe n'est jamais enregistre, seule une cle de session est conservee).
echo.
set /p RUN=Lancer le diagnostic maintenant ? (O/n) 
if /i "%RUN%"=="n" goto end
call diagnose.bat
:end
echo.
echo Pour demarrer le serveur ensuite : double-clic sur start.bat
pause
