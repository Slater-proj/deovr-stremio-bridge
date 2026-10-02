@echo off
chcp 65001 >nul
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Ce fichier doit etre lance en administrateur : clic droit ^> Executer en tant qu'administrateur.
  pause
  exit /b
)
set PORT=4477
for /f %%p in ('node -e "try{console.log(require('./config.json').port||4477)}catch(e){console.log(4477)}"') do set PORT=%%p
netsh advfirewall firewall delete rule name="DeoVR Stremio Bridge" >nul 2>&1
netsh advfirewall firewall add rule name="DeoVR Stremio Bridge" dir=in action=allow protocol=TCP localport=%PORT% profile=private
echo.
echo Port %PORT% autorise en reseau prive (utile seulement pour un casque autonome ou un autre appareil).
pause
