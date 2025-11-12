# 🚀 Collabrium Complete Local Setup Guide

## 📋 Prerequisites Installation

### 1. Install Node.js
1. Go to [nodejs.org](https://nodejs.org/)
2. Download the **LTS version** (v18 or higher)
3. Run the installer and follow the setup wizard
4. Verify installation: Open Command Prompt and run:
   ```bash
   node --version
   npm --version
   ```

### 2. Install MongoDB Community Server

#### Windows Installation:
1. Go to [MongoDB Download Center](https://www.mongodb.com/try/download/community)
2. Select **Windows** and **MSI** package
3. Download and run the installer
4. Choose **Complete** installation
5. Install **MongoDB Compass** (optional GUI)
6. **Important**: Check "Install MongoDB as a Service" during installation

#### Verify MongoDB Installation:
```bash
# Open Command Prompt as Administrator
mongod --version
mongosh --version
```

### 3. Start MongoDB Service
```bash
# Method 1: Using Services (Windows)
# Press Win + R, type "services.msc"
# Find "MongoDB" service and start it

# Method 2: Command Line
net start MongoDB

# Method 3: Manual start
mongod --dbpath C:\data\db
```

## 🛠️ Project Setup

### Step 1: Install Dependencies
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

### Step 2: Configure Environment
The `config.env` file is already configured for local development:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/collabrium
JWT_SECRET=collabrium_local_jwt_secret_key_2024
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:3000
```

### Step 3: Seed Initial Data
```bash
# Make sure MongoDB is running first
node seedBadges.js
```

## 🚀 Running the Application

### Method 1: Automated (Windows)
1. **Double-click `setup.bat`** - Installs all dependencies
2. **Double-click `start-dev.bat`** - Starts both servers
3. **Open browser** to `http://localhost:3000`

### Method 2: Manual (Two Terminals)

**Terminal 1 - Backend Server:**
```bash
cd C:\Users\user6974g\Music\collabrium
npm run dev
```
You should see: `Server running on port 5000`

**Terminal 2 - Frontend Server:**
```bash
cd C:\Users\user6974g\Music\collabrium\client
npm start
```
You should see: `Local: http://localhost:3000`

### Method 3: Single Command
```bash
cd C:\Users\user6974g\Music\collabrium
npm run dev:full
```

## 🌐 Access the Application

- **Main Application**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000/api`
- **Socket.io**: `http://localhost:5000` (WebSocket connection)

## 🎯 Testing All Features

### 1. User Registration & Login
1. Go to `http://localhost:3000`
2. Click "Sign Up"
3. Fill in: Name, Email, Password, Skills
4. Click "Create Account"
5. Login with your credentials

### 2. Create Posts
1. Click "CollabFeed" in sidebar
2. Click "Create Post"
3. Add title: "Need help with React"
4. Add description: "Looking for someone to help me understand React hooks"
5. Add tags: "react, javascript, frontend"
6. Choose "Free Collaboration"
7. Click "Create Post"

### 3. Real-time Collaboration
1. Click on any post to view details
2. Click "Join" to enter collaboration room
3. Start typing in the chat
4. Test real-time messaging
5. Try file sharing (click paperclip icon)

### 4. Video Calls (WebRTC)
1. In a collaboration room
2. Click "Video Call" button
3. Allow camera and microphone permissions
4. Test audio/video controls
5. Try screen sharing
6. Test with multiple participants

### 5. Wallet System
1. Go to "Wallet" in sidebar
2. View your CollabPoints balance (starts with 100)
3. Click "Transfer" tab
4. Enter recipient email and amount
5. Test transferring points
6. Check transaction history

### 6. Gamification
1. Complete collaborations to earn points
2. Go to "Leaderboard" to see rankings
3. Check your profile for badges
4. Level up through activities

### 7. Admin Features
1. Register a second user account
2. In the first account, check if you have admin access
3. Go to `/admin` route to access admin dashboard
4. Test user management and analytics

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongosh

# If not running, start the service
net start MongoDB

# Or start manually
mongod --dbpath C:\data\db
```

### Port Already in Use
```bash
# Kill processes on ports
npx kill-port 5000
npx kill-port 3000

# Or find and kill manually
netstat -ano | findstr :5000
taskkill /PID <PID_NUMBER> /F
```

### Dependency Issues
```bash
# Clear npm cache
npm cache clean --force

# Delete and reinstall
rm -rf node_modules package-lock.json
npm install

# For frontend
cd client
rm -rf node_modules package-lock.json
npm install
```

### Frontend Build Errors
```bash
# In client directory
cd client
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

## 📊 Database Structure

After successful setup, you'll have:
- **Users Collection**: User profiles, authentication data
- **Posts Collection**: Collaboration posts and comments
- **Rooms Collection**: Real-time collaboration rooms
- **Wallets Collection**: CollabPoints and transactions
- **Badges Collection**: Gamification badges and achievements

## 🔧 Development Commands

```bash
# Backend development
npm run dev          # Start backend with nodemon
npm start           # Start backend in production mode

# Frontend development  
cd client
npm start           # Start React development server
npm run build       # Build for production
npm test            # Run tests

# Database operations
node seedBadges.js  # Seed initial badges
mongosh             # MongoDB shell
```

## 📁 Project Structure

```
collabrium/
├── 📁 models/              # Database schemas (MongoDB)
│   ├── User.js            # User model with authentication
│   ├── Post.js            # Posts and comments
│   ├── Room.js            # Collaboration rooms
│   ├── Wallet.js          # CollabPoints system
│   └── Badge.js           # Gamification badges
├── 📁 routes/              # API endpoints (Express)
│   ├── auth.js            # Authentication routes
│   ├── users.js           # User management
│   ├── posts.js           # Post CRUD operations
│   ├── rooms.js           # Room management
│   ├── wallet.js          # Wallet operations
│   └── admin.js           # Admin functions
├── 📁 middleware/           # Custom middleware
│   ├── auth.js            # JWT authentication
│   └── errorHandler.js    # Error handling
├── 📁 client/              # React frontend
│   ├── 📁 src/
│   │   ├── 📁 components/  # Reusable components
│   │   ├── 📁 pages/       # Page components
│   │   ├── 📁 contexts/    # React contexts
│   │   └── 📄 App.tsx      # Main application
│   └── 📄 package.json     # Frontend dependencies
├── 📄 server.js            # Main Express server
├── 📄 package.json         # Backend dependencies
├── 📄 config.env           # Environment variables
├── 📄 seedBadges.js        # Database seeder
├── 📄 setup.bat            # Windows setup script
├── 📄 start-dev.bat        # Windows start script
└── 📄 README.md            # Project documentation
```

## ✅ Success Checklist

You'll know everything is working when:

- [ ] **MongoDB** is running (`mongosh` works)
- [ ] **Backend** shows "Server running on port 5000"
- [ ] **Frontend** shows "Local: http://localhost:3000"
- [ ] **Browser** loads Collabrium homepage
- [ ] **Registration** creates new users
- [ ] **Login** authenticates users
- [ ] **Posts** can be created and viewed
- [ ] **Chat** works in real-time
- [ ] **Video calls** connect successfully
- [ ] **Wallet** shows CollabPoints balance
- [ ] **Leaderboard** displays user rankings

## 🎉 You're Ready!

Your Collabrium platform is now fully set up for local development with:

- ✅ **Real-time collaboration** (Socket.io)
- ✅ **Video conferencing** (WebRTC)
- ✅ **Reward economy** (CollabPoints)
- ✅ **Gamification** (Badges & Leaderboards)
- ✅ **User management** (JWT Authentication)
- ✅ **Admin dashboard** (Platform management)

**Open `http://localhost:3000` and start collaborating! 🚀**

## 📞 Need Help?

If you encounter issues:
1. Check MongoDB is running
2. Verify all dependencies are installed
3. Check console logs for errors
4. Ensure ports 3000 and 5000 are available
5. Try restarting both servers

**Happy Coding! 🎊**
