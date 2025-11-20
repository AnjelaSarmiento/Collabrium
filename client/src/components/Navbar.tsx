import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Bars3Icon,
  XMarkIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { getProfileImageUrl } from '../utils/image';
import NotificationsDropdown from './NotificationsDropdown';
import MessagesDropdown from './MessagesDropdown';
import axios from 'axios';
import { useSocket } from '../contexts/SocketContext';
import { useNotificationDispatcher, useDispatchedUpdates } from '../contexts/NotificationDispatcherContext';
import { DispatchedUpdate } from '../services/NotificationDispatcher';
import { useMessagesWidget } from '../contexts/MessagesWidgetContext';

const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const { socket, onMessageNew } = useSocket();
  const dispatcher = useNotificationDispatcher();
  const { isDropdownOpen, openDropdown, closeDropdown } = useMessagesWidget();
  const userIdDependency = user?._id ? user._id.toString() : '';
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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
    // Exclude message notifications - they should only appear in Messages dropdown
    const onNotif = (data: { read?: boolean; type?: string }) => {
      // Skip message notifications - they belong in Messages dropdown only
      if (data.type === 'message') {
        console.log('[Navbar] Skipping message notification from bell count - messages only appear in Messages dropdown');
        return;
      }
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

  // Load unread messages count
  const loadMessagesCount = React.useCallback(async () => {
    try {
      const res = await axios.get('/messages/conversations');
      if (res.data.success) {
        const conversations = res.data.conversations || [];
        const totalUnread = conversations.reduce((sum: number, conv: any) => {
          return sum + (conv.unreadCount || 0);
        }, 0);
        setUnreadMessagesCount(totalUnread);
      }
    } catch (err) {
      console.error('[Navbar] Failed to load messages count:', err);
      setUnreadMessagesCount(0);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadMessagesCount();
    } else {
      setUnreadMessagesCount(0);
    }
  }, [isAuthenticated, loadMessagesCount]);

  // Initialize messages count and subscribe to real-time updates
  useEffect(() => {
    if (!isAuthenticated) return;

    // Load initial count
    loadMessagesCount();

    const currentUserId = user?._id ? user._id.toString() : undefined;

    // Listen for new messages using proper socket context handler
    const handleMessageNew = (data: { conversationId: string; message: any }) => {
      if (!data?.message) return;
      const sender = data.message.sender;
      let senderId: string | undefined;
      if (typeof sender === 'string') {
        senderId = sender;
      } else if (sender?._id) {
        senderId = sender._id.toString();
      }

      const conversationId = data.conversationId;

      // Ignore messages sent by the current user
      if (senderId && currentUserId && senderId === currentUserId) {
        return;
      }

      if (window.__activeConversationId === conversationId) {
        // User is viewing the conversation; ensure server count stays in sync
        loadMessagesCount();
      } else {
        // Optimistically increment count immediately
        setUnreadMessagesCount(prev => prev + 1);
        // Then refresh from server to ensure accuracy
        loadMessagesCount();
      }
    };

    // Listen for conversation read events (when user opens a conversation)
    const handleConversationRead = () => {
      // Refresh count when conversation is read
      loadMessagesCount();
    };

    // Listen for unified message count update events from other components
    const handleMessageCountUpdate = (event: CustomEvent) => {
      const { totalUnread } = event.detail || {};
      if (typeof totalUnread === 'number') {
        console.log('[Navbar] Received message count update event:', totalUnread);
        setUnreadMessagesCount(totalUnread);
      }
    };

    // Use proper socket context handler instead of direct socket.on
    const offMessageNew = onMessageNew(handleMessageNew);
    
    window.addEventListener('conversation:read', handleConversationRead);
    window.addEventListener('messages:count-update', handleMessageCountUpdate as EventListener);

    // Refresh count periodically to catch any missed updates
    const interval = setInterval(() => {
      loadMessagesCount();
    }, 30000); // Every 30 seconds

    return () => {
      offMessageNew();
      window.removeEventListener('conversation:read', handleConversationRead);
      window.removeEventListener('messages:count-update', handleMessageCountUpdate as EventListener);
      clearInterval(interval);
    };
  }, [socket, loadMessagesCount, isAuthenticated, userIdDependency, user]);

  // Open/close dropdown; when opening, mark all as read and reset count
  const toggleNotifications = async () => {
    const next = !isNotifOpen;
    setIsNotifOpen(next);
  };

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        // Check if click is on the profile button (don't close if clicking the button)
        const profileButton = profileMenuRef.current.querySelector('button');
        if (profileButton && profileButton.contains(target)) {
          return; // Don't close if clicking the button
        }
        setIsProfileMenuOpen(false);
      }
    };

    // Add a small delay to avoid immediate close when opening
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  const navLinkClasses = (path: string) => {
    const base = 'px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap border border-transparent';
    const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
    const active =
      'bg-primary-50 text-primary-600 border-primary-100 dark:bg-[var(--bg-hover)] dark:text-[var(--link-color)] dark:border-[var(--border-color)] shadow-sm';
    const inactive = 'text-secondary-700 dark:text-[var(--text-secondary)] hover:text-primary-600 dark:hover:text-[var(--link-color)]';
    return `${base} ${isActive ? active : inactive}`;
  };

  const mobileLinkClasses = (path: string) => {
    const isActive = location.pathname === path || location.pathname.startsWith(`${path}/`);
    return `block px-3 py-2 rounded-md text-base font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-600 dark:bg-[var(--bg-hover)] dark:text-[var(--link-color)]'
        : 'text-secondary-700 dark:text-[var(--text-secondary)] hover:text-primary-600 dark:hover:text-[var(--link-color)]'
    }`;
  };

  // Check if sidebar should be visible (same logic as Layout component)
  const isFullPageRoom = location.pathname.startsWith('/app/room/');
  const shouldShowSidebar = isAuthenticated && !isFullPageRoom;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 bg-white dark:bg-[var(--bg-card)] shadow-sm border-b border-secondary-200 dark:border-[var(--border-color)] ${shouldShowSidebar ? 'md:left-64' : ''}`}>
      <div className="w-full">
        <div className="flex justify-between items-center h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center flex-shrink-0">
            {/* Title moved to sidebar */}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center flex-shrink-0 gap-2 lg:gap-4">
            {isAuthenticated ? (
              <>
                <Link
                  to="/app/feed"
                  className={navLinkClasses('/app/feed')}
                >
                  CollabFeed
                </Link>
                <Link
                  to="/app/leaderboard"
                  className={navLinkClasses('/app/leaderboard')}
                >
                  Leaderboard
                </Link>
                <Link
                  to="/app/wallet"
                  className={navLinkClasses('/app/wallet')}
                >
                  Wallet
                </Link>
                
                {/* Messages Button */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDropdownOpen) {
                        closeDropdown();
                      } else {
                        openDropdown();
                      }
                    }}
                    className="relative p-2 rounded-full hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] text-secondary-700 dark:text-[var(--icon-color)] hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors"
                    aria-label="Open messages"
                  >
                    <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    {unreadMessagesCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-primary-600 text-white text-[10px] min-w-[16px] h-[16px] px-1">
                        {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                      </span>
                    )}
                  </button>
                  {isDropdownOpen && (
                    <MessagesDropdown onClose={closeDropdown} />
                  )}
                </div>

                {/* Notifications Bell */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNotifications();
                    }}
                    className="relative p-2 rounded-full hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] text-secondary-700 dark:text-[var(--icon-color)] hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors"
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
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsProfileMenuOpen(!isProfileMenuOpen);
                    }}
                    className="flex items-center space-x-2 text-secondary-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    <img
                      src={getProfileImageUrl(user?.profilePicture) || '/default-avatar.png'}
                      alt={user?.name}
                      className="h-8 w-8 rounded-full"
                    />
                    <span className="text-xs bg-primary-100 text-primary-800 px-2 py-1 rounded-full">
                      {user?.collabPoints} CP
                    </span>
                  </button>

                  {isProfileMenuOpen && (
                    <div className="fixed top-16 right-4 w-96 bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl border border-secondary-200 dark:border-[var(--border-color)] z-50 max-h-[600px] flex flex-col">
                      <div className="p-3 border-b border-secondary-200 dark:border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
                        <span className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">Account</span>
                      </div>
                      <div className="flex-1 overflow-y-auto max-h-[550px] scrollbar-hide">
                      <Link
                        to={`/app/profile/${user?._id}`}
                        className="flex items-center px-4 py-2 text-sm text-secondary-700 dark:text-[var(--text-secondary)] hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)]"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        <UserCircleIcon className="h-4 w-4 mr-2" />
                        Profile
                      </Link>
                      <Link
                        to="/app/settings"
                        className="flex items-center px-4 py-2 text-sm text-secondary-700 dark:text-[var(--text-secondary)] hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)]"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        <Cog6ToothIcon className="h-4 w-4 mr-2" />
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-2 text-sm text-secondary-700 dark:text-[var(--text-secondary)] hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)]"
                      >
                        <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                        Logout
                      </button>
                      </div>
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
          <div className="md:hidden flex items-center flex-shrink-0">
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
                    className={mobileLinkClasses('/app/feed')}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    CollabFeed
                  </Link>
                  <Link
                    to="/app/leaderboard"
                    className={mobileLinkClasses('/app/leaderboard')}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Leaderboard
                  </Link>
                  <Link
                    to="/app/wallet"
                    className={mobileLinkClasses('/app/wallet')}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Wallet
                  </Link>
                  <Link
                    to={`/app/profile/${user?._id}`}
                    className={mobileLinkClasses(`/app/profile/${user?._id}`)}
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
                    className={mobileLinkClasses('/login')}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className={mobileLinkClasses('/register')}
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
