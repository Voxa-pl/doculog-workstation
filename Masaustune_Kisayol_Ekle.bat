@echo off
chcp 65001 > nul
cls

echo =====================================================================
echo    Masaüstüne DocuLog Workstation Kısayolu Ekleniyor...
echo =====================================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_shortcut.ps1"

echo.
pause
