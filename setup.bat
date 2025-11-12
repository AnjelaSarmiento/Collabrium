@echo off
echo Starting Collabrium Local Development Environment...
echo.

echo Installing backend dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Backend dependency installation failed!
    pause
    exit /b 1
)

echo.
echo Installing frontend dependencies...
cd client
call npm install
if %errorlevel% neq 0 (
    echo Frontend dependency installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo Seeding initial data...
call node seedBadges.js
if %errorlevel% neq 0 (
    echo Data seeding failed! Make sure MongoDB is running.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Collabrium Setup Complete!
echo ========================================
echo.
echo To start the application:
echo.
echo Terminal 1 (Backend):
echo   npm run dev
echo.
echo Terminal 2 (Frontend):
echo   cd client
echo   npm start
echo.
echo Then open: http://localhost:3000
echo.
echo Make sure MongoDB is running first!
echo.
pause
