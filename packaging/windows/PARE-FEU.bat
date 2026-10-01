@echo off
chcp 65001 >nul
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Ce fichier doit etre lance en administrateur : clic droit ^> Executer en tant qu'administrateur.
  pause
  exit /b
)
netsh advfirewall firewall delete rule name="DeoVR Stremio Bridge" >nul 2>&1
netsh advfirewall firewall add rule name="DeoVR Stremio Bridge" dir=in action=allow program="%~dp0DeoVR-Stremio-Bridge.exe" enable=yes profile=private
echo.
echo Application autorisee en reseau prive (utile seulement pour un casque autonome ou un autre appareil du reseau).
pause
