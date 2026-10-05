@echo off
echo Backing up project source...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-code.ps1"
echo.
pause
