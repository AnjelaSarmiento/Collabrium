@echo off
echo Setting up MongoDB for Collabrium...
echo.

echo Checking MongoDB installation...
mongod --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: MongoDB is not installed!
    echo Please install MongoDB Community Server from:
    echo https://www.mongodb.com/try/download/community
    pause
    exit /b 1
)
echo MongoDB is installed.

echo.
echo Starting MongoDB service...
net start MongoDB >nul 2>&1
if %errorlevel% equ 0 (
    echo MongoDB service started successfully.
) else (
    echo MongoDB service is already running or not found.
)

echo.
echo Testing MongoDB connection...
mongosh --eval "db.runCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo MongoDB connection successful!
) else (
    echo WARNING: MongoDB connection test failed.
    echo Please make sure MongoDB is running.
)

echo.
echo ========================================
echo   MongoDB Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Run: node seedBadges.js
echo 2. Run: npm run dev
echo 3. In another terminal: cd client ^&^& npm start
echo 4. Open: http://localhost:3000
echo.
pause
