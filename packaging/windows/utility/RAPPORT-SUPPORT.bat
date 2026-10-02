@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Preparation du rapport (journaux, etat du pont, configuration SANS mot de passe ni cle)...
echo Astuce : lance d'abord le pont (ou LANCER-MODE-DEV.bat) pour inclure son etat en direct.
echo.
DeoVR-Stremio-Bridge.exe --report --no-pause
echo.
if exist "data\rapport-support.txt" (
  echo Fichier a transmettre : data\rapport-support.txt
  echo Relis-le avant de le partager : adresses et e-mail sont masques, mais verifie quand meme.
  explorer /select,"%CD%\data\rapport-support.txt"
) else (
  echo Rapport introuvable : voir le message ci-dessus.
)
pause
