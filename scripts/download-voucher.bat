@echo off
if "%~1"=="" (
    echo Usage: drag a CSV file onto this bat file.
    pause
    exit /b 1
)
cd /d "%~dp0"
echo Input file: %~1
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "download-voucher.ps1" -filePath "%~1"
echo.
echo Done. Exit code: %ERRORLEVEL%
pause
