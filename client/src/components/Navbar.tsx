import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Bars3Icon,
  XMarkIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { getProfileImageUrl } from '../utils/image';
import NotificationsDropdown from './NotificationsDropdown';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import { useNotificationDispatcher, useDispatchedUpdates } from '../contexts/NotificationDispatcherContext';
import { DispatchedUpdate } from '../services/NotificationDispatcher';

const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const { socket } = useSocket();
  const dispatcher = useNotificationDispatcher();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Helper function to load count from server
  const loadCount = React.useCallback(async () => {
    try {
      const res = await axios.get('/notifications/unread-count');
      const count = Number(res.data?.count || 0);
      const validCount = isNaN(count) ? 0 : Math.max(0, count);
      console.log('[Navbar] Unread count loaded from server:', { raw: res.data?.count, parsed: count, valid: validCount });
      setUnreadCount(validCount);
    } catch (err) {
      console.error('[Navbar] Failed to load unread count:', err);
      setUnreadCount(0);
    }
  }, []);

  // Initialize unread count and subscribe to real-time increments
  useEffect(() => {
    // Load initial count
    loadCount();
    
    // Handle new notifications via socket - route through dispatcher
    const onNotif = (data: { read?: boolean }) => {
      // Only increment if unread - route through dispatcher for buffering
      if (data.read !== true) {
        dispatcher.dispatch({
          type: 'notification:count_update',
          payload: { 
            increment: 1, // Increment by 1
          },
          timestamp: Date.now(),
          source: 'navbar:notification',
        });
      }
    };
    socket?.on('notification', onNotif);
    
    // Handle refresh events from window (triggered by NotificationBridge after dispatcher processes refresh)
    // This is a direct refresh trigger, not going through dispatcher to avoid loops
    const onRefresh = () => {
      console.log('[Navbar] Refresh count event received from window - refetching from server');
      loadCount();
    };
    
    window.addEventListener('notifications:refresh-count', onRefresh);
    
    return () => {
      socket?.off('notification', onNotif);
      window.removeEventListener('notifications:refresh-count', onRefresh);
    };
  }, [socket, loadCount, dispatcher]);

  // Subscribe to dispatched updates to update count
  const handleDispatchedUpdate = useCallback((update: DispatchedUpdate) => {
    // Handle refresh events first (from refreshNeeded flag)
    if (update.refreshNeeded) {
      console.log('[Navbar] Refresh needed - refetching count from server');
      loadCount();
      return;
    }
    
    // Handle count increments from dispatched updates
    if (update.countUpdates.unreadCount !== undefined) {
      // Increment count (dispatcher handles coalescing, but we increment locally)
      setUnreadCount((c) => {
        const newCount = Math.max(0, c + (update.countUpdates.unreadCount || 0));
        console.log('[Navbar] Count updated from dispatcher:', c, '->', newCount);
        return newCount;
      });
    }
  }, [loadCount]);

  useDispatchedUpdates(handleDispatchedUpdate);

  // Open/close dropdown; when opening, mark all as read and reset count
  const toggleNotifications = async () => {
    const next = !isNotifOpen;
    setIsNotifOpen(next);
  };

  return (
    <nav className="bg-white shadow-sm border-b border-secondary-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            {/* Title moved to sidebar */}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {isAuthenticated ? (
              <>
                <Link
                  to="/app/feed"
                  className="text-secondary-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  CollabFeed
                </Link>
                <Link
                  to="/app/leaderboard"
                  className="text-secondary-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Leaderboard
                </Link>
                <Link
                  to="/app/wallet"
                  className="text-secondary-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Wallet
                </Link>
                
                {/* Notifications Bell */}
                <div className="relative">
                  <button
                    onClick={toggleNotifications}
                    className="relative p-2 rounded-full hover:bg-secondary-50 text-secondary-700 hover:text-primary-600 transition-colors"
                    aria-label="Open notifications"
                  >
                    <BellIcon className="h-6 w-6" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-primary-600 text-white text-[10px] min-w-[16px] h-[16px] px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {isNotifOpen && (
                    <NotificationsDropdown onClose={() => setIsNotifOpen(false)} />
                  )}
                </div>

                {/* User Profile Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    className="flex items-center space-x-2 text-secondary-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    <img
                      src={getProfileImageUrl(user?.profilePicture) || '/default-avatar.png'}
                      alt={user?.name}
                      className="h-8 w-8 rounded-full"
                    />
                    <span>{user?.name}</span>
                    <span className="text-xs bg-primary-100 text-primary-800 px-2 py-1 rounded-full">
                      {user?.collabPoints} CP
                    </span>
                  </button>

                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-secondary-200">
                      <Link
                        to={`/app/profile/${user?._id}`}
                        className="flex items-center px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-50"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        <UserCircleIcon className="h-4 w-4 mr-2" />
                        Profile
                      </Link>
                      <Link
                        to="/app/settings"
                        className="flex items-center px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-50"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        <Cog6ToothIcon className="h-4 w-4 mr-2" />
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-50"
                      >
                        <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className="text-secondary-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn-primary"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-secondary-700 hover:text-primary-600 p-2"
            >
              {isMenuOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-secondary-200">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/app/feed"
                    className="block px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    CollabFeed
                  </Link>
                  <Link
                    to="/app/leaderboard"
                    className="block px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Leaderboard
                  </Link>
                  <Link
                    to="/app/wallet"
                    className="block px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Wallet
                  </Link>
                  <Link
                    to={`/app/profile/${user?._id}`}
                    className="block px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="block px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="block px-3 py-2 text-secondary-700 hover:text-primary-600 rounded-md text-base font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
