@echo off
REM VET Vision React - Installation Script
REM This script installs all dependencies and starts the dev server

echo.
echo ========================================
echo VET Vision - React Installation
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

echo Node.js found: 
node --version

echo.
echo Installing dependencies (this may take 2-5 minutes)...
echo.

call npm install

if errorlevel 1 (
    echo.
    echo ERROR: npm install failed
    echo Please check your internet connection and try again
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Starting development server...
echo.
echo The app will open at: http://localhost:5173
echo.
echo Press Ctrl+C in this window to stop the server
echo.

call npm run dev

pause
