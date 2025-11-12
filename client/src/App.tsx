import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { PresenceProvider } from './contexts/PresenceContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { NotificationDispatcherProvider } from './contexts/NotificationDispatcherContext';
import Layout from './components/Layout';
import ToastContainer from './components/ToastContainer';
import NotificationBridge from './components/NotificationBridge';
import LandingLayout from './components/LandingLayout';
import Landing from './pages/Landing';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import CollabFeed from './pages/CollabFeed';
import PostDetail from './pages/PostDetail';
import CreatePost from './pages/CreatePost';
import CollabRoom from './pages/CollabRoom';
import Wallet from './pages/Wallet';
import Settings from './pages/Settings';
import Leaderboard from './pages/Leaderboard';
import AdminDashboard from './pages/AdminDashboard';
import BinPage from './pages/BinPage';
import BinPostDetail from './pages/BinPostDetail';
import EditPost from './pages/EditPost';
import SavedPosts from './pages/SavedPosts';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

function App() {
  // Debug: Check environment variables at app startup
  useEffect(() => {
    console.log('=== APP.TSX DEBUG ===');
    console.log('GOOGLE CLIENT ID:', process.env.REACT_APP_GOOGLE_CLIENT_ID);
    console.log('API URL:', process.env.REACT_APP_API_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('All process.env keys:', Object.keys(process.env));
    console.log('===================');
  }, []);

  return (
    <AuthProvider>
      <SocketProvider>
        <PresenceProvider>
          <NotificationDispatcherProvider>
            <NotificationProvider>
              <NotificationBridge />
              <Router>
              <Routes>
            {/* Landing page with separate layout */}
            <Route path="/" element={<LandingLayout />}>
              <Route index element={<Landing />} />
            </Route>
            
            {/* Public routes with landing layout */}
            <Route path="/login" element={<LandingLayout />}>
              <Route index element={<Login />} />
            </Route>
            <Route path="/register" element={<LandingLayout />}>
              <Route index element={<Register />} />
            </Route>
            
            {/* Authenticated routes with app layout */}
            <Route path="/app" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Home />} />
              <Route path="feed" element={<CollabFeed />} />
              <Route path="feed/:postId" element={<PostDetail />} />
              <Route path="feed/create" element={<CreatePost />} />
              <Route path="feed/edit/:postId" element={<EditPost />} />
              <Route path="saved" element={<SavedPosts />} />
              <Route path="messages" element={<Messages />} />
              <Route path="bin" element={<BinPage />} />
              <Route path="bin/:postId" element={<BinPostDetail />} />
              <Route path="profile/:userId" element={<Profile />} />
              <Route path="room/:roomId" element={<CollabRoom />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="settings" element={<Settings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="admin/*" element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } />
            </Route>
            
            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              {/* Global ToastContainer - renders on all routes (inside Router for navigate) */}
              <ToastContainer />
            </Router>
            </NotificationProvider>
          </NotificationDispatcherProvider>
        </PresenceProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;