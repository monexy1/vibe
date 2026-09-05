@echo off
title Vibe Messenger
cd /d "%~dp0"

echo.
echo ==========================================
echo              VIBE MESSENGER
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed.
    echo Install Node.js LTS and run this file again.
    pause
    exit /b 1
)

if not exist "node_modules\ws" (
    echo Installing Vibe dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo Could not install dependencies.
        echo Check your internet connection and run START_VIBE.bat again.
        pause
        exit /b 1
    )
)

echo Starting Vibe server...
start "" http://localhost:3000
node server.js

echo.
echo Vibe server stopped.
pause
