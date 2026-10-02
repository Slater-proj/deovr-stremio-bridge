@echo off
chcp 65001 >nul
powershell -NoProfile -Command "$p=[Environment]::GetFolderPath('Startup')+'\DeoVR-Stremio-Bridge.lnk'; if (Test-Path $p) { Remove-Item $p; 'Raccourci retire.' } else { 'Aucun raccourci de demarrage automatique trouve.' }"
pause
