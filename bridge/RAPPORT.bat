@echo off
chcp 65001 >nul
cd /d "%~dp0"
node report.js
echo.
echo Joignez le fichier rapport-support.txt a votre demande d'aide (adresses et email masques ; relisez-le quand meme avant de le partager).
pause
