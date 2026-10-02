@echo off
chcp 65001 >nul
cd /d "%~dp0.."
if not exist "config.json" (
  echo config.json n'existe pas encore : lance une fois DeoVR-Stremio-Bridge.exe, il le cree a cote de lui.
  pause
  exit /b
)
start notepad "%CD%\config.json"
