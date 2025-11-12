# 🚀 Collabrium Local Setup Guide

## 📋 Prerequisites

Before running Collabrium locally, make sure you have:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **MongoDB** - [Download here](https://www.mongodb.com/try/download/community)
3. **Git** (optional) - [Download here](https://git-scm.com/)

## 🛠️ Installation Steps

### Step 1: Install MongoDB Locally

1. **Download MongoDB Community Server** from the official website
2. **Install MongoDB** following the installation wizard
3. **Start MongoDB Service**:
   - On Windows: MongoDB should start automatically as a service
   - On Mac: `brew services start mongodb-community`
   - On Linux: `sudo systemctl start mongod`

4. **Verify MongoDB is running**:
   ```bash
   mongosh
   ```
   If successful, you'll see the MongoDB shell.

### Step 2: Install Backend Dependencies

```bash
# Navigate to project root
cd C:\Users\user6974g\Music\collabrium

# Install backend dependencies
npm install
```

### Step 3: Install Frontend Dependencies

```bash
# Navigate to client directory
cd client

# Install frontend dependencies
npm install

# Go back to root directory
cd ..
```

### Step 4: Seed Initial Data

```bash
# Seed badges and initial data
node seedBadges.js
```

## 🚀 Running the Application

### Option 1: Run Both Services Separately (Recommended)

**Terminal 1 - Backend Server:**
```bash
# In project root directory
npm run dev
```
This will start the backend server on `http://localhost:5000`

**Terminal 2 - Frontend Server:**
```bash
# In project root directory
cd client
npm start
```
This will start the frontend server on `http://localhost:3000`

### Option 2: Run Both Services Together

```bash
# In project root directory
npm run dev:full
```

## 🌐 Accessing the Application

1. **Open your browser** and go to: `http://localhost:3000`
2. **Register a new account** or use the demo credentials
3. **Start collaborating!**

## 🔧 Configuration Files

### Backend Configuration (`config.env`)
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/collabrium
JWT_SECRET=collabrium_local_jwt_secret_key_2024
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:3000
```

### Frontend Configuration
The frontend automatically connects to `http://localhost:5000` for API calls.

## 📁 Project Structure

```
collabrium/
├── models/                 # Database models
├── routes/                 # API routes
├── middleware/             # Custom middleware
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   └── App.tsx         # Main app component
│   └── package.json
├── server.js               # Main server file
├── package.json            # Backend dependencies
└── config.env              # Environment variables
```

## 🎯 Features Available

### ✅ User Features
- **Registration & Login** with JWT authentication
- **Profile Management** with skills and bio
- **User Search** and discovery
- **Rating & Review** system

### ✅ Collaboration Features
- **Post Creation** (Free Collaboration or Paid Tasks)
- **Real-time Chat** in collaboration rooms
- **Video Calls** with WebRTC (like Google Meet)
- **File Sharing** in rooms
- **Task Management** within rooms

### ✅ Gamification Features
- **CollabPoints Wallet** system
- **Badge System** with different rarities
- **Level Progression** based on experience
- **Leaderboard** with multiple sorting options

### ✅ Admin Features
- **User Management** and moderation
- **Post Management** and deletion
- **Platform Analytics** and statistics
- **Badge Creation** and awarding

## 🔍 Testing the Features

### 1. User Registration & Login
- Go to `http://localhost:3000`
- Click "Sign Up" to create a new account
- Fill in your details and register
- Login with your credentials

### 2. Create a Post
- Click "Create Post" in the CollabFeed
- Add title, description, and tags
- Choose "Free Collaboration" or "Paid Task"
- Publish your post

### 3. Join a Collaboration Room
- Click on any post to view details
- Click "Join" to enter the collaboration room
- Start chatting in real-time
- Use the "Video Call" button for video conferencing

### 4. Test Video Calls
- Join a collaboration room
- Click "Video Call" button
- Allow camera and microphone permissions
- Test audio/video controls and screen sharing

### 5. Manage Your Wallet
- Go to "Wallet" in the sidebar
- View your CollabPoints balance
- Test transferring points to other users
- Try purchasing additional points

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongosh

# If not running, start MongoDB service
# Windows: Check Services.msc for MongoDB
# Mac: brew services start mongodb-community
# Linux: sudo systemctl start mongod
```

### Port Already in Use
```bash
# Kill process using port 5000
npx kill-port 5000

# Kill process using port 3000
npx kill-port 3000
```

### Frontend Build Issues
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Backend Issues
```bash
# Check if all dependencies are installed
npm install

# Verify environment variables
cat config.env
```

## 📊 Default Data

After running `node seedBadges.js`, you'll have:

- **8 Pre-defined Badges** (Common to Legendary)
- **Sample Users** (if you register)
- **Empty Database** ready for your data

## 🎉 Success!

If everything is working correctly, you should see:

1. **Backend**: `Server running on port 5000` in Terminal 1
2. **Frontend**: `Local: http://localhost:3000` in Terminal 2
3. **Browser**: Collabrium homepage at `http://localhost:3000`

## 🔄 Development Workflow

1. **Make changes** to backend code → Backend auto-restarts
2. **Make changes** to frontend code → Frontend auto-refreshes
3. **Database changes** → Restart backend server
4. **New dependencies** → Run `npm install` in respective directory

## 📞 Support

If you encounter any issues:

1. Check the console logs in both terminals
2. Verify MongoDB is running
3. Ensure all dependencies are installed
4. Check that ports 3000 and 5000 are available

**Happy Collaborating! 🚀**
