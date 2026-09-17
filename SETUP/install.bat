@echo off
REM VET Vision React - Install Only
REM Just installs dependencies without starting dev server

echo.
echo ========================================
echo VET Vision - React Install
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

echo Installing npm dependencies...
echo This may take 2-5 minutes on first install
echo.

call npm install

if errorlevel 1 (
    echo.
    echo ERROR: Installation failed
    echo Please check your internet connection
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Run: npm run dev
echo 2. Open: http://localhost:5173
echo.
echo Or run install-and-run.bat to install and start immediately
echo.

pause
