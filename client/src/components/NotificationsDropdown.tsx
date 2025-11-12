import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getProfileImageUrl } from '../utils/image';
import { formatRelativeTime } from '../utils/formatTime';
import { getNotificationTypeLabel, groupNotificationsByTime } from '../utils/notificationLabels';
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
        className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full ${bgColor} p-1 ring-1 ring-white`}
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
      
      // Server handles deletion and emits refresh events
      // Just refresh the notification list to reflect server state
      const res = await axios.get('/notifications', { params: { page: 1, pageSize: 10 } });
      const data = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      setItems(data);
      
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
      
      // Server handles deletion and emits refresh events
      // Just refresh the notification list to reflect server state
      const res = await axios.get('/notifications', { params: { page: 1, pageSize: 10 } });
      const data = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      setItems(data);
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
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/notifications', { params: { page: 1, pageSize: 10 } });
      const data = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      setItems(data);
    } catch {
      // On error, show nothing rather than ephemeral toasts
      setItems([]);
    } finally {
      setLoading(false);
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
    
    if (hasNewNotifications || needsRefresh) {
      console.log('[NotificationsDropdown] 📬 Received dispatched update - refetching notifications (notifications:', update.notifications.length, ', refresh:', needsRefresh, ')');
      // Refetch notifications after buffer delay (all surfaces update together)
      loadNotifications();
    }
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <div ref={containerRef} className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-secondary-200 z-50">
      <div className="p-3 border-b border-secondary-200 flex items-center justify-between">
        <span className="text-sm font-medium text-secondary-900">Notifications</span>
        <button onClick={() => { onClose(); navigate('/app/notifications'); }} className="text-xs text-primary-700 hover:underline">
          See All
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto scrollbar-hide relative">
        {/* Subtle bottom fade hint */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
        {loading && <div className="p-4 text-sm text-secondary-600">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="p-4 text-sm text-secondary-600">No notifications</div>
        )}
        {!loading && items.length > 0 && (() => {
          const grouped = groupNotificationsByTime(items);
          return (
            <>
              {grouped.map((group) => (
                <div key={group.timeGroup}>
                  {/* Time group header */}
                  <div className="px-3 py-2 bg-secondary-50 border-b border-secondary-200">
                    <span className="text-xs font-semibold text-secondary-600 uppercase tracking-wide">
                      {group.timeGroup}
                    </span>
                  </div>
                  {/* Notifications in this time group */}
        <ul className="divide-y divide-secondary-200">
                    {group.notifications.map((n, idx) => {
                      const isConnectionAccepted = n.type === 'connection_accepted';
                      const isClickable = !isConnectionAccepted;
                      
                      return (
                        <li
                          key={n._id || idx}
                          className={`notification-item ${n.read ? '' : 'unread'} p-3 flex items-start gap-3 relative ${
                            isClickable ? 'cursor-pointer hover:bg-gray-100' : ''
                          }`}
                          style={n.read ? undefined : { backgroundColor: '#E8F2FF' }}
                          onClick={() => isClickable && handleNotificationClick(n)}
                        >
                          {/* Type label - top-left corner */}
                          <div className="absolute top-2 left-2">
                            <span className="text-[10px] font-semibold text-secondary-500 uppercase tracking-wide bg-white/80 px-1.5 py-0.5 rounded">
                              {getNotificationTypeLabel(n.type)}
                            </span>
                          </div>
                          <div className="relative flex-shrink-0 mt-5">
                            <img src={getProfileImageUrl(n.actor?.profilePicture) || '/default-avatar.png'} alt={n.actor?.name} className="h-9 w-9 rounded-full object-cover" />
                            {renderTypeBadge(n.type)}
                          </div>
                          <div className="flex-1 min-w-0 mt-5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {n.type === 'message' ? (
                                  <div className={`text-sm ${n.read ? 'text-secondary-900 font-normal' : 'text-secondary-900 font-normal'}`}>
                                    <div className="font-medium">{n.actor?.name}</div>
                                    <div className="mt-1 font-normal">{n.message}</div>
                                  </div>
                                ) : (
                                  <p className={`text-sm ${n.read ? 'text-secondary-700 font-normal' : 'text-secondary-900 font-semibold'}`}>
                                    {renderMessage(n.message, n.actor?.name, !!n.read)}
                                  </p>
                                )}
                              </div>
                              {n.createdAt && (
                                <span className="text-xs text-secondary-500 flex-shrink-0 whitespace-nowrap">
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
                                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
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
          );
        })()}
      </div>
    </div>
  );
};

export default NotificationsDropdown;


