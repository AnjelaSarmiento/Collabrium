@echo off
title Collabrium Development Server
echo.
echo ========================================
echo   Collabrium Development Server
echo ========================================
echo.
echo Starting Backend Server on port 5000...
echo Starting Frontend Server on port 3000...
echo.
echo Open your browser to: http://localhost:3000
echo.
echo Press Ctrl+C to stop both servers
echo.

start "Backend Server" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
start "Frontend Server" cmd /k "cd client && npm start"

echo Both servers are starting...
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
pause
