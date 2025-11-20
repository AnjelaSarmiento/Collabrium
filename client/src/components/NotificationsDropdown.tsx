import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getProfileImageUrl } from '../utils/image';
import { formatRelativeTime } from '../utils/formatTime';
import { groupNotificationsByTime } from '../utils/notificationLabels';
import { useDispatchedUpdates } from '../contexts/NotificationDispatcherContext';
import { DispatchedUpdate } from '../services/NotificationDispatcher';

interface NotificationItem {
  _id?: string;
  type: string;
  actor: { _id: string; name: string; profilePicture?: string };
  message: string;
  metadata?: any;
  createdAt?: string;
  read?: boolean;
}

const NotificationsDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  // Track clicked notifications to prevent re-navigation on list refresh
  const clickedNotificationsRef = useRef<Set<string>>(new Set());
  
  // Memoize grouped notifications to prevent re-grouping on every render
  const groupedNotifications = useMemo(() => {
    if (items.length === 0) return [];
    return groupNotificationsByTime(items);
  }, [items]);

  // Helper: Render message with actor name bolded if it appears in the text
  const renderMessage = (message: string, actorName: string | undefined, isRead: boolean) => {
    if (!actorName || !message) {
      return <span>{message}</span>;
    }
    
    // Check if actor name appears at the start of the message
    const nameLength = actorName.length;
    if (message.substring(0, nameLength) === actorName) {
      return (
        <>
          <span className="font-medium">{actorName}</span>
          <span className="ml-1">{message.substring(nameLength)}</span>
        </>
      );
    }
    
    // If name doesn't appear at start, just return message as-is
    return <span>{message}</span>;
  };

  const renderTypeBadge = (type: string) => {
    let bgColor = 'bg-gray-100';
    let imageSrc: string | null = null;
    switch (type) {
      case 'comment_added':
        imageSrc = '/badges/comment.png';
        bgColor = 'bg-blue-100';
        break;
      case 'reply_added':
        imageSrc = '/badges/reply.png';
        bgColor = 'bg-indigo-100';
        break;
      case 'post_reaction_added':
      case 'reaction_added':
        imageSrc = '/badges/reaction.png';
        bgColor = 'bg-red-100';
        break;
      case 'connection_request':
      case 'connection_accepted':
        imageSrc = '/badges/connection.png';
        bgColor = 'bg-green-100';
        break;
      case 'message':
        imageSrc = '/badges/message.png';
        bgColor = 'bg-violet-100';
        break;
      case 'post_created':
        imageSrc = '/badges/post-created.png';
        bgColor = 'bg-yellow-100';
        break;
      default:
        imageSrc = null;
    }
    if (!imageSrc) return null;
    return (
      <span
        className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full ${bgColor} p-1 ring-1 ring-white dark:ring-[var(--bg-card)]`}
        aria-hidden="true"
      >
        <img src={imageSrc} alt="" className="h-3 w-3 object-contain" />
      </span>
    );
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    // connection_accepted is read-only - no action on click
    if (n.type === 'connection_accepted') {
      return;
    }
    
    // Prevent re-navigation if this notification was already clicked
    if (n._id && clickedNotificationsRef.current.has(n._id)) {
      console.log('[NotificationsDropdown] Notification already clicked, skipping re-navigation:', n._id);
      return;
    }
    
    // Mark this notification as clicked
    if (n._id) {
      clickedNotificationsRef.current.add(n._id);
    }
    
    // Mark as read first if unread
    if (!n._id || n.read) {
      // If already read, just navigate
      navigateToNotification(n);
      return;
    }
    
    try {
      await axios.put(`/notifications/${n._id}/read`, { read: true });
      setItems(prev => prev.map(it => it._id === n._id ? { ...it, read: true } : it));
      window.dispatchEvent(new Event('notifications:refresh-count'));
      navigateToNotification(n);
    } catch {
      // Navigate even if marking as read fails
      navigateToNotification(n);
    }
  };

  const handleAcceptConnection = async (n: NotificationItem) => {
    const userId = n.metadata?.userId || n.actor?._id;
    console.log('[NotificationsDropdown] Accept button clicked for notification:', n._id);
    console.log('[NotificationsDropdown] UserId:', userId);
    console.log('[NotificationsDropdown] Notification:', n);
    
    if (!userId || !n._id) {
      console.error('[NotificationsDropdown] Missing userId or notification ID:', { userId, notificationId: n._id });
      return;
    }
    
    try {
      console.log('[NotificationsDropdown] Calling /users/accept/' + userId);
      // Accept the connection request - server handles notification deletion
      const acceptResponse = await axios.post(`/users/accept/${userId}`);
      console.log('[NotificationsDropdown] Accept response:', acceptResponse.data);
      
      // Remove the accepted notification from the list immediately
      setItems(prev => prev.filter(item => item._id !== n._id));
      
      // Silently refresh to get updated list from server
      loadNotifications(true);
      
      console.log('[NotificationsDropdown] Accept completed successfully');
    } catch (error: any) {
      console.error('[NotificationsDropdown] Failed to accept connection:', error);
      console.error('[NotificationsDropdown] Error details:', error.response?.data || error.message);
      console.error('[NotificationsDropdown] Error status:', error.response?.status);
      alert('Failed to accept connection request. Please try again.');
    }
  };

  const handleDeclineConnection = async (n: NotificationItem) => {
    const userId = n.metadata?.userId || n.actor?._id;
    if (!userId || !n._id) return;
    
    try {
      // Decline the connection request - server handles notification deletion
      await axios.post(`/users/decline/${userId}`);
      
      // Remove the declined notification from the list immediately
      setItems(prev => prev.filter(item => item._id !== n._id));
      
      // Silently refresh to get updated list from server
      loadNotifications(true);
    } catch (error) {
      console.error('Failed to decline connection:', error);
    }
  };

  const navigateToNotification = (n: NotificationItem) => {
    // Navigate based on notification type and trigger highlighting (except for messages)
    if (n.type === 'message' && n.metadata?.conversationId) {
      const params = new URLSearchParams();
      params.set('open', n.metadata.conversationId);
      navigate(`/app/messages?${params.toString()}`);
      onClose();
      // No highlighting for messages - just redirect
    } else if (n.type === 'comment_added' && n.metadata?.postId) {
      const params = new URLSearchParams();
      if (n.metadata?.commentId) {
        params.set('highlight', n.metadata.commentId);
        console.log('[NotificationsDropdown] Navigating to comment:', { postId: n.metadata.postId, commentId: n.metadata.commentId });
      } else {
        console.warn('[NotificationsDropdown] comment_added notification missing commentId:', n);
      }
      const url = params.toString() ? `/app/feed/${n.metadata.postId}?${params.toString()}` : `/app/feed/${n.metadata.postId}`;
      console.log('[NotificationsDropdown] Navigation URL:', url);
      navigate(url);
      onClose();
      // PostDetail will read highlight param and highlight accordingly
    } else if (n.type === 'post_reaction_added' && n.metadata?.postId) {
      // Add highlight param to indicate navigation from notification
      navigate(`/app/feed/${n.metadata.postId}?highlight=post`);
      onClose();
    } else if (n.type === 'reaction_added' && n.metadata?.postId) {
      const params = new URLSearchParams();
      if (n.metadata?.commentId) {
        params.set('highlight', n.metadata.commentId);
      }
      if (n.metadata?.replyId) {
        params.set('reply', n.metadata.replyId);
      }
      const url = params.toString() ? `/app/feed/${n.metadata.postId}?${params.toString()}` : `/app/feed/${n.metadata.postId}`;
      navigate(url);
      onClose();
      // PostDetail will read highlight/reply params and highlight accordingly
    } else if (n.type === 'reply_added' && n.metadata?.postId) {
      const params = new URLSearchParams();
      if (n.metadata?.replyId) {
        params.set('reply', n.metadata.replyId);
      }
      if (n.metadata?.commentId) {
        params.set('highlight', n.metadata.commentId);
      }
      const url = params.toString() ? `/app/feed/${n.metadata.postId}?${params.toString()}` : `/app/feed/${n.metadata.postId}`;
      navigate(url);
      onClose();
      // PostDetail will read highlight/reply params and highlight accordingly
    } else if (n.type === 'post_created' && n.metadata?.postId) {
      // Add highlight param to indicate navigation from notification
      navigate(`/app/feed/${n.metadata.postId}?highlight=post`);
      onClose();
    } else if (n.type === 'connection_request' && (n.metadata?.userId || n.actor?._id)) {
      // Navigate to the sender's profile page where user can view details and accept/decline
      const userId = n.metadata?.userId || n.actor?._id;
      navigate(`/app/profile/${userId}`);
      onClose();
    } else if (n.type === 'collaboration_request' && n.metadata?.postId) {
      // Navigate to the post detail page where owner can approve/decline
      navigate(`/app/feed/${n.metadata.postId}`);
      onClose();
    } else if ((n.type === 'collaboration_request_approved' || n.type === 'collaboration_request_declined') && n.metadata?.postId) {
      // Navigate to the post detail page
      navigate(`/app/feed/${n.metadata.postId}`);
      onClose();
    }
    // connection_accepted is read-only - no navigation (intentionally removed)
  };

  // Load notifications function
  // Exclude message notifications - they should only appear in Messages dropdown
  const loadNotifications = useCallback(async (silent: boolean = false) => {
    try {
      if (!silent) {
      setLoading(true);
      }
      const res = await axios.get('/notifications', { params: { page: 1, pageSize: 10 } });
      const data = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      // Filter out message notifications - they belong in Messages dropdown only
      const filteredData = data.filter((item: NotificationItem) => item.type !== 'message');
      
      // Merge with existing items to preserve state and prevent flickering
      setItems(prev => {
        // Create a map of existing items by ID for quick lookup
        const existingMap = new Map(prev.map(item => [item._id, item]));
        
        // Merge new items with existing ones, preserving read state and other properties
        const merged = filteredData.map((newItem: NotificationItem) => {
          const existing = existingMap.get(newItem._id);
          if (existing) {
            // Preserve existing item's state (like read status) but update with new data
            return {
              ...newItem,
              read: existing.read !== undefined ? existing.read : newItem.read,
            };
          }
          return newItem;
        });
        
        // Sort by createdAt (newest first) to maintain order
        merged.sort((a: NotificationItem, b: NotificationItem) => {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        
        return merged;
      });
    } catch {
      // On error, show nothing rather than ephemeral toasts
      if (!silent) {
      setItems([]);
      }
    } finally {
      if (!silent) {
      setLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Subscribe to dispatched updates from unified dispatcher
  // This ensures all notification surfaces update together after the buffer delay
  useDispatchedUpdates((update: DispatchedUpdate) => {
    // Check if we have new notifications or refresh needed
    const hasNewNotifications = update.notifications.length > 0;
    const needsRefresh = update.refreshNeeded;
    
    if (hasNewNotifications) {
      // Add new notifications incrementally without full refetch
      const newNotifications = update.notifications
        .filter((n: any) => n.type !== 'message') // Exclude message notifications
        .map((n: any) => ({
          _id: n.metadata?.notificationId || n._id,
          type: n.type,
          actor: n.actor,
          message: n.message || '',
          metadata: n.metadata,
          createdAt: n.timestamp || n.createdAt || new Date().toISOString(),
          read: n.read || false,
        }))
        .filter((n: NotificationItem) => n._id); // Only include items with valid IDs
      
      if (newNotifications.length > 0) {
        console.log('[NotificationsDropdown] 📬 Adding new notifications incrementally:', newNotifications.length);
        setItems(prev => {
          // Create a set of existing IDs to avoid duplicates
          const existingIds = new Set(prev.map(item => item._id));
          
          // Add only new notifications that don't already exist
          const toAdd = newNotifications.filter(n => n._id && !existingIds.has(n._id));
          
          if (toAdd.length === 0) {
            return prev; // No new items, return existing list unchanged
          }
          
          // Merge new items with existing ones, maintaining order (newest first)
          const merged = [...toAdd, ...prev];
          merged.sort((a: NotificationItem, b: NotificationItem) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
          
          return merged;
        });
      }
    } else if (needsRefresh) {
      console.log('[NotificationsDropdown] 📬 Received refresh request - silently refetching notifications');
      // Silent refresh - don't show loading state
      loadNotifications(true);
    }
  });

  useEffect(() => {
    if (!onClose) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Check if click is on the Notifications button (don't close if clicking the button)
        const notificationsButton = document.querySelector('[aria-label="Open notifications"]');
        if (notificationsButton && notificationsButton.contains(target)) {
          return; // Don't close if clicking the button
        }
        onClose();
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
  }, [onClose]);

  return (
    <div ref={containerRef} className="fixed top-16 right-4 w-96 bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl border border-secondary-200 dark:border-[var(--border-color)] z-50 max-h-[600px] flex flex-col overflow-hidden">
      <div className="p-3 border-b border-secondary-200 dark:border-[var(--border-color)] flex items-center justify-between flex-shrink-0 bg-white dark:bg-[var(--bg-card)]">
        <span className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">Notifications</span>
        <button onClick={() => { onClose(); navigate('/app/notifications'); }} className="text-xs text-primary-700 dark:text-[var(--link-color)] hover:underline">
          See All
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 relative">
        {/* Subtle bottom fade hint */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent dark:from-[var(--bg-card)] dark:to-transparent" />
        {loading && <div className="p-4 text-sm text-secondary-600 dark:text-[var(--text-secondary)]">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="p-4 text-sm text-secondary-600 dark:text-[var(--text-secondary)]">No notifications</div>
        )}
        {!loading && items.length > 0 && (
            <>
              {groupedNotifications.map((group: any) => (
                <div key={group.timeGroup}>
                  {/* Time group header */}
                  <div className="px-3 py-2 bg-secondary-50 dark:bg-[var(--bg-hover)] border-b border-secondary-200 dark:border-[var(--border-color)]">
                    <span className="text-xs font-semibold text-secondary-600 dark:text-[var(--text-secondary)] uppercase tracking-wide">
                      {group.timeGroup}
                    </span>
                  </div>
                  {/* Notifications in this time group */}
        <ul className="divide-y divide-secondary-200 dark:divide-[var(--border-color)]">
                    {group.notifications.map((n: NotificationItem) => {
                      const isConnectionAccepted = n.type === 'connection_accepted';
                      const isClickable = !isConnectionAccepted;
                      
                      // Use stable key - always use _id, fallback to composite key if missing
                      const stableKey = n._id || `${n.type}-${n.actor?._id}-${n.createdAt}`;
                      
                      return (
                        <li
                          key={stableKey}
                          className={`notification-item ${n.read ? '' : 'unread'} p-3 flex items-start gap-3 relative rounded-lg ${
                            isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)]' : ''
                          } ${n.read ? '' : 'bg-[#EFF6FF] dark:bg-[var(--bg-hover)]'}`}
                          onClick={() => isClickable && handleNotificationClick(n)}
                        >
                          <div className="relative flex-shrink-0">
                            <img src={getProfileImageUrl(n.actor?.profilePicture) || '/default-avatar.png'} alt={n.actor?.name} className="h-9 w-9 rounded-full object-cover" />
                            {renderTypeBadge(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {n.type === 'message' ? (
                                  <div className={`text-sm ${n.read ? 'text-secondary-900 font-normal' : 'text-secondary-900 font-normal'} dark:text-[var(--text-primary)]`}>
                                    <div className="font-medium">{n.actor?.name}</div>
                                    <div className="mt-1 font-normal">{n.message}</div>
                                  </div>
                                ) : (
                                  <p className={`text-sm ${n.read ? 'text-secondary-700 font-normal' : 'text-secondary-900 font-semibold'} dark:text-[var(--text-primary)]`}>
                                    {renderMessage(n.message, n.actor?.name, !!n.read)}
                                  </p>
                                )}
                              </div>
                              {n.createdAt && (
                                <span className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] flex-shrink-0 whitespace-nowrap">
                                  {formatRelativeTime(n.createdAt)}
                                </span>
                              )}
                            </div>
                            {/* Accept/Decline buttons for connection requests */}
                            {n.type === 'connection_request' && (
                              <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptConnection(n);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeclineConnection(n);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-[var(--text-primary)] bg-gray-100 dark:bg-[var(--bg-hover)] rounded-md hover:bg-gray-200 dark:hover:bg-[var(--bg-panel)] transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-[var(--link-color)]"
                                >
                                  Decline
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
        </ul>
                </div>
              ))}
            </>
        )}
      </div>
    </div>
  );
};

export default NotificationsDropdown;


