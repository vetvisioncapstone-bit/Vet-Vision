@echo off
REM VET Vision React - Start Dev Server
REM Runs the development server with hot module replacement

echo.
echo ========================================
echo VET Vision - React Dev Server
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo ERROR: node_modules not found!
    echo Please run: install.bat first
    pause
    exit /b 1
)

echo Starting development server...
echo.
echo The app will be available at: http://localhost:5173
echo.
echo Features:
echo - Hot Module Replacement (auto-refresh on save)
echo - Fast rebuild times
echo - Press Ctrl+C to stop
echo.

call npm run dev

pause
