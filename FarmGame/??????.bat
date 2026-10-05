@echo off
echo Fixing WeChat config for build output...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-wechat-config.ps1"
echo.
pause
