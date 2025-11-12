# MongoDB Setup Script for Collabrium
# Run this script to set up MongoDB for local development

Write-Host "Setting up MongoDB for Collabrium..." -ForegroundColor Green
Write-Host ""

# Check if MongoDB is installed
try {
    $mongodVersion = mongod --version 2>$null
    Write-Host "✅ MongoDB is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ MongoDB is not installed!" -ForegroundColor Red
    Write-Host "Please install MongoDB Community Server from: https://www.mongodb.com/try/download/community" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if MongoDB service is running
try {
    $service = Get-Service -Name "MongoDB" -ErrorAction Stop
    if ($service.Status -eq "Running") {
        Write-Host "✅ MongoDB service is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️ MongoDB service is not running. Starting it..." -ForegroundColor Yellow
        Start-Service -Name "MongoDB"
        Write-Host "✅ MongoDB service started" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ MongoDB service not found. Starting MongoDB manually..." -ForegroundColor Yellow
    Write-Host "Please start MongoDB manually or install it as a service." -ForegroundColor Yellow
}

# Test MongoDB connection
Write-Host ""
Write-Host "Testing MongoDB connection..." -ForegroundColor Yellow
try {
    $result = mongosh --eval "db.runCommand('ping')" --quiet 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ MongoDB connection successful" -ForegroundColor Green
    } else {
        Write-Host "❌ MongoDB connection failed" -ForegroundColor Red
        Write-Host "Please make sure MongoDB is running" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Could not test MongoDB connection" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MongoDB Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. Run: node seedBadges.js" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. In another terminal: cd client && npm start" -ForegroundColor White
Write-Host "4. Open: http://localhost:3000" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
