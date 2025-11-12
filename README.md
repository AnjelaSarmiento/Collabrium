# Collabrium - Real-time Collaboration Platform

Collabrium is a next-generation platform that combines learning, freelancing, and community collaboration. Users can post help requests, collaborate in real-time through chat or video calls, and earn rewards (CollabPoints).

## 🚀 Features

- **User System & Profiles**: Personal pages with skills, CollabPoints, badges, and reviews
- **Community Feed (CollabFeed)**: Public space for collaboration requests and paid tasks
- **Real-time Collaboration Rooms**: Live problem-solving with chat, file sharing, and whiteboard
- **Video Call System**: Built-in video conferencing with WebRTC
- **CollabPoints Wallet**: Gamified digital economy with rewards and payments
- **Gamification System**: Badges, levels, and leaderboards
- **Admin Dashboard**: Management and moderation tools

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express.js** (MVC Architecture)
- **MongoDB** + **Mongoose** (Database)
- **Socket.io** (Real-time communication)
- **JWT** + **bcrypt** (Authentication)
- **WebRTC** (Video calls)

### Frontend
- **React** + **TypeScript**
- **Tailwind CSS** (Styling)
- **React Router** (Routing)
- **Axios** (HTTP client)
- **Socket.io Client** (Real-time features)

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Backend Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp config.env .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/collabrium
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRE=7d
   
   # Cloudinary Configuration (for file uploads)
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   
   # Payment Integration
   PAYPAL_CLIENT_ID=your_paypal_client_id
   PAYPAL_CLIENT_SECRET=your_paypal_client_secret
   
   # Frontend URL
   CLIENT_URL=http://localhost:3000
   ```

3. **Start MongoDB**
   ```bash
   # If using local MongoDB
   mongod
   ```

4. **Seed initial data**
   ```bash
   node seedBadges.js
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

### Frontend Setup

1. **Navigate to client directory**
   ```bash
   cd client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

## 🚀 Running the Application

### Development Mode
```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
cd client && npm start
```

### Production Mode
```bash
# Build frontend
cd client && npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
collabrium/
├── models/                 # Database models (MVC Model)
│   ├── User.js
│   ├── Post.js
│   ├── Room.js
│   ├── Wallet.js
│   └── Badge.js
├── routes/                 # API routes (MVC Controller)
│   ├── auth.js
│   ├── users.js
│   ├── posts.js
│   ├── rooms.js
│   ├── wallet.js
│   └── admin.js
├── middleware/             # Custom middleware
│   ├── auth.js
│   └── errorHandler.js
├── client/                 # React frontend (MVC View)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── contexts/
│   │   └── App.tsx
│   └── package.json
├── server.js              # Main server file
├── package.json
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/profile/:userId` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/search` - Search users
- `GET /api/users/leaderboard` - Get leaderboard

### Posts
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create new post
- `GET /api/posts/:id` - Get single post
- `POST /api/posts/:id/join` - Join post
- `POST /api/posts/:id/upvote` - Upvote post

### Rooms
- `GET /api/rooms` - Get user's rooms
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/message` - Send message
- `POST /api/rooms/:id/complete` - Complete room

### Wallet
- `GET /api/wallet` - Get wallet info
- `GET /api/wallet/transactions` - Get transactions
- `POST /api/wallet/transfer` - Transfer points
- `POST /api/wallet/purchase` - Purchase points

## 🎯 Key Features Implementation

### Real-time Collaboration
- Socket.io for real-time chat and notifications
- WebRTC for video calls
- File sharing and whiteboard functionality

### CollabPoints System
- Earn points for completing collaborations
- Spend points on paid tasks
- Escrow system for secure transactions
- Integration with PayPal/GCash

### Gamification
- Badge system with different rarities
- Level progression based on experience
- Leaderboards for competition
- Achievement tracking

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Input validation and sanitization
- Rate limiting
- CORS protection
- Helmet.js security headers

## 🚀 Deployment

### Backend (Render/Railway/AWS)
1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically

### Frontend (Vercel/Netlify)
1. Connect your GitHub repository
2. Set build command: `cd client && npm run build`
3. Set output directory: `client/build`

### Database (MongoDB Atlas)
1. Create cluster on MongoDB Atlas
2. Get connection string
3. Update MONGODB_URI in environment variables

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email support@collabrium.com or join our Discord community.

---

**Collabrium** - Where collaboration meets rewards! 🚀
