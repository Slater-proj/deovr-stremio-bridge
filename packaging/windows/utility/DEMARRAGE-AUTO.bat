@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Ce script ajoute un raccourci dans le dossier Demarrage de Windows :
echo le pont se lancera tout seul a l'ouverture de ta session (fenetre reduite).
echo Si tu deplaces le dossier du pont, relance ce script.
echo.
set /p OK=Continuer ? (O/n) 
if /i "%OK%"=="n" exit /b
powershell -NoProfile -Command "$d='%CD%'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\DeoVR-Stremio-Bridge.lnk');$s.TargetPath=$d+'\DeoVR-Stremio-Bridge.exe';$s.WorkingDirectory=$d;$s.WindowStyle=7;$s.Description='DeoVR-Stremio Bridge';$s.Save()"
if errorlevel 1 (echo Echec de la creation du raccourci.) else (echo Raccourci cree. Pour le retirer : DEMARRAGE-AUTO-RETIRER.bat)
pause
