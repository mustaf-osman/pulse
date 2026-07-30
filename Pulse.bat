@echo off
cd /d "%~dp0"
start "" /B cmd /c "npm start >nul 2>&1"
exit
