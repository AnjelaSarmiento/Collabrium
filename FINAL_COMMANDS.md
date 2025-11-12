# 🚀 Collabrium Local Setup - FINAL COMMANDS

## 🎯 **QUICK START COMMANDS**

### **Step 1: Install MongoDB**
1. Download from: https://www.mongodb.com/try/download/community
2. Install with default settings
3. Start MongoDB service:
   ```bash
   # Windows: Check Services.msc for MongoDB service
   # Or run: net start MongoDB
   ```

### **Step 2: Install Dependencies**
```bash
# Navigate to project directory
cd C:\Users\user6974g\Music\collabrium

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### **Step 3: Seed Database**
```bash
# Make sure MongoDB is running first
node seedBadges.js
```

### **Step 4: Start Application**

**Option A: Two Terminals (Recommended)**
```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd client
npm start
```

**Option B: Single Command**
```bash
npm run dev:full
```

**Option C: Windows Batch Files**
```bash
# Double-click these files:
setup.bat          # Install dependencies
start-dev.bat      # Start both servers
```

## 🌐 **ACCESS POINTS**

- **Main App**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **Socket.io**: http://localhost:5000 (WebSocket)

## ✅ **SUCCESS INDICATORS**

You'll know it's working when you see:

1. **Backend Terminal**: `Server running on port 5000`
2. **Frontend Terminal**: `Local: http://localhost:3000`
3. **Browser**: Collabrium homepage loads at http://localhost:3000
4. **Console**: No error messages

## 🎯 **TEST FEATURES**

1. **Register** a new account
2. **Create** a post in CollabFeed
3. **Join** a collaboration room
4. **Chat** in real-time
5. **Start** a video call
6. **Check** your wallet balance
7. **View** the leaderboard

## 🐛 **TROUBLESHOOTING**

### MongoDB Issues:
```bash
# Check if running
mongosh

# Start service
net start MongoDB
```

### Port Conflicts:
```bash
# Kill processes
npx kill-port 5000
npx kill-port 3000
```

### Dependency Issues:
```bash
# Clear and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## 📁 **PROJECT STRUCTURE**

```
collabrium/
├── models/          # Database schemas
├── routes/          # API endpoints
├── middleware/      # Custom middleware
├── client/          # React frontend
├── server.js        # Main server
├── package.json     # Backend deps
├── config.env       # Environment vars
├── setup.bat        # Windows setup
├── start-dev.bat    # Windows start
└── seedBadges.js    # Database seeder
```

## 🎉 **YOU'RE READY!**

Your Collabrium platform includes:

- ✅ **Real-time collaboration** (Socket.io)
- ✅ **Video calls** (WebRTC)
- ✅ **Reward economy** (CollabPoints)
- ✅ **Gamification** (Badges & Leaderboards)
- ✅ **User management** (JWT Authentication)
- ✅ **Admin dashboard** (Platform management)

**Open http://localhost:3000 and start collaborating! 🚀**
