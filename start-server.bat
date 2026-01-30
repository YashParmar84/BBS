@echo off
echo ========================================
echo  Starting Beg Borrow Steal Server
echo ========================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting server...
echo URL: http://localhost:3000
echo.
node server.js
pause
