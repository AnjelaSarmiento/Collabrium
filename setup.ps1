# Collabrium Local Setup Script
Write-Host "Starting Collabrium Local Development Environment..." -ForegroundColor Green
Write-Host ""

# Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend dependency installation failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Install frontend dependencies
Write-Host ""
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location client
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend dependency installation failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Set-Location ..

# Seed initial data
Write-Host ""
Write-Host "Seeding initial data..." -ForegroundColor Yellow
node seedBadges.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Data seeding failed! Make sure MongoDB is running." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Collabrium Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the application:" -ForegroundColor Green
Write-Host ""
Write-Host "Terminal 1 (Backend):" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 2 (Frontend):" -ForegroundColor Yellow
Write-Host "  cd client" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor White
Write-Host ""
Write-Host "Then open: http://localhost:3000" -ForegroundColor Magenta
Write-Host ""
Write-Host "Make sure MongoDB is running first!" -ForegroundColor Red
Write-Host ""
Read-Host "Press Enter to exit"
