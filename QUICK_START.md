# 🚀 Collabrium Local Development Setup

## 🎯 Quick Start (Windows)

### Method 1: Automated Setup
1. **Double-click `setup.bat`** to install all dependencies
2. **Double-click `start-dev.bat`** to start both servers
3. **Open browser** to `http://localhost:3000`

### Method 2: Manual Setup
```bash
# 1. Install dependencies
npm install
cd client && npm install && cd ..

# 2. Seed data
node seedBadges.js

# 3. Start backend (Terminal 1)
npm run dev

# 4. Start frontend (Terminal 2)
cd client
npm start
```

## 📋 Prerequisites

### Required Software:
1. **Node.js** (v16+) - [Download](https://nodejs.org/)
2. **MongoDB** - [Download](https://www.mongodb.com/try/download/community)

### MongoDB Setup:
1. **Install MongoDB Community Server**
2. **Start MongoDB Service**:
   - Windows: Check Services.msc for "MongoDB"
   - Or run: `mongod` in command prompt
3. **Verify**: Open `mongosh` to test connection

## 🔧 Configuration

### Environment Variables (`config.env`):
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/collabrium
JWT_SECRET=collabrium_local_jwt_secret_key_2024
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:3000
```

### Ports Used:
- **Backend**: `http://localhost:5000`
- **Frontend**: `http://localhost:3000`
- **MongoDB**: `mongodb://localhost:27017`

## 🚀 Running the Application

### Option 1: Separate Terminals (Recommended)
```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend  
cd client
npm start
```

### Option 2: Single Command
```bash
npm run dev:full
```

### Option 3: Windows Batch Files
- **Setup**: Double-click `setup.bat`
- **Start**: Double-click `start-dev.bat`

## 🌐 Access Points

- **Main App**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000/api`
- **Socket.io**: `http://localhost:5000` (WebSocket)

## 🎯 Testing Features

### 1. User Registration
- Go to `http://localhost:3000`
- Click "Sign Up"
- Create account with email/password
- Login and explore

### 2. Create Posts
- Navigate to "CollabFeed"
- Click "Create Post"
- Add title, description, tags
- Choose "Free Collaboration" or "Paid Task"
- Publish

### 3. Real-time Chat
- Join any post's collaboration room
- Start chatting in real-time
- Test file sharing

### 4. Video Calls
- In a collaboration room
- Click "Video Call" button
- Allow camera/microphone permissions
- Test audio/video controls
- Try screen sharing

### 5. Wallet System
- Go to "Wallet" in sidebar
- View CollabPoints balance
- Test transfers and purchases
- Check transaction history

### 6. Gamification
- Complete collaborations to earn points
- Check "Leaderboard" for rankings
- View badges in profile
- Level up through activities

## 🐛 Troubleshooting

### MongoDB Issues:
```bash
# Check if MongoDB is running
mongosh

# Start MongoDB service
# Windows: Services.msc → MongoDB
# Or: mongod --dbpath C:\data\db
```

### Port Conflicts:
```bash
# Kill processes on ports
npx kill-port 5000
npx kill-port 3000
```

### Dependency Issues:
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Frontend Issues:
```bash
# In client directory
cd client
rm -rf node_modules package-lock.json
npm install
```

## 📊 Default Data

After running `node seedBadges.js`:
- ✅ 8 Pre-defined badges (Common to Legendary)
- ✅ Empty database ready for users
- ✅ Sample badge categories and requirements

## 🔍 Development Workflow

1. **Backend Changes**: Auto-restart with nodemon
2. **Frontend Changes**: Auto-refresh with React
3. **Database Changes**: Restart backend server
4. **New Dependencies**: Run `npm install` in respective directory

## 📁 Project Structure

```
collabrium/
├── 📁 models/           # Database schemas
├── 📁 routes/           # API endpoints  
├── 📁 middleware/       # Custom middleware
├── 📁 client/           # React frontend
│   ├── 📁 src/
│   │   ├── 📁 components/  # React components
│   │   ├── 📁 pages/       # Page components
│   │   ├── 📁 contexts/    # React contexts
│   │   └── 📄 App.tsx      # Main app
│   └── 📄 package.json
├── 📄 server.js         # Main server
├── 📄 package.json      # Backend deps
├── 📄 config.env        # Environment vars
├── 📄 setup.bat         # Windows setup
├── 📄 start-dev.bat     # Windows start
└── 📄 seedBadges.js     # Data seeder
```

## ✅ Success Indicators

You'll know everything is working when you see:

1. **Backend Terminal**: `Server running on port 5000`
2. **Frontend Terminal**: `Local: http://localhost:3000`
3. **Browser**: Collabrium homepage loads
4. **Console**: No error messages

## 🎉 Features Available

### ✅ User Management
- Registration & Login (JWT)
- Profile editing
- User search
- Rating system

### ✅ Collaboration
- Post creation (Free/Paid)
- Real-time chat (Socket.io)
- Video calls (WebRTC)
- File sharing
- Task management

### ✅ Economy
- CollabPoints wallet
- Transfer system
- Purchase points
- Transaction history

### ✅ Gamification
- Badge system
- Level progression
- Leaderboards
- Achievement tracking

### ✅ Admin Panel
- User management
- Post moderation
- Analytics dashboard
- Badge creation

## 🚀 Ready to Launch!

Your Collabrium platform is now ready for local development and testing. All features are fully functional including:

- 🤝 **Real-time collaboration**
- 🎥 **Video conferencing** 
- 💰 **Reward economy**
- 🏆 **Gamification**
- 👥 **Community features**
- 🛡️ **Admin tools**

**Open `http://localhost:3000` and start collaborating! 🎊**
