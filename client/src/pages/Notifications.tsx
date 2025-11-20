import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getProfileImageUrl } from '../utils/image';
import { formatRelativeTime } from '../utils/formatTime';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { groupNotificationsByTime } from '../utils/notificationLabels';
import { useDispatchedUpdates } from '../contexts/NotificationDispatcherContext';
import { DispatchedUpdate } from '../services/NotificationDispatcher';

interface NotificationItem {
  _id: string;
  type: string;
  actor: { _id: string; name: string; profilePicture?: string };
  message: string;
  metadata?: any;
  createdAt: string;
  read: boolean;
}

const NotificationsPage: React.FC = () => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [contextMenu, setContextMenu] = useState<{ notificationId: string; x: number; y: number } | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [totalCount, setTotalCount] = useState<number>(0);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [undoStack, setUndoStack] = useState<{ id: string; notification: NotificationItem; timer: NodeJS.Timeout }[]>([]);
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
        className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full ${bgColor} p-1 ring-1 ring-white dark:ring-[var(--bg-card)]`}
        aria-hidden="true"
      >
        <img src={imageSrc} alt="" className="h-3 w-3 object-contain" />
      </span>
    );
  };

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Exclude message notifications from the filter options and results
      // Messages should only appear in Messages dropdown, not in bell notifications
      const typeFilter = filter !== 'all' && filter !== 'message' ? filter : undefined;
      const res = await axios.get('/notifications', { params: { page, pageSize, type: typeFilter } });
      const data = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      // Filter out message notifications - they belong in Messages dropdown only
      const filteredData = data.filter((item: NotificationItem) => item.type !== 'message');
      setItems(filteredData);
      // Update total count from pagination (excluding messages)
      if (res.data?.pagination?.total !== undefined) {
        // Calculate count excluding messages
        const totalExcludingMessages = filteredData.length;
        setTotalCount(totalExcludingMessages);
      }
    } catch (e: any) {
      // Fallback to empty list without showing error banner so page remains usable
      setItems([]);
      setError(null);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filter]);

  useEffect(() => {
    fetchNotifications();
    // Clear selections when page or filter changes
    setSelectedIds(new Set());
  }, [fetchNotifications]);

  // Cleanup undo timers on unmount
  useEffect(() => {
    return () => {
      undoStack.forEach(item => clearTimeout(item.timer));
    };
  }, [undoStack]);

  // Subscribe to dispatched updates from unified dispatcher
  // This ensures all notification surfaces update together after the buffer delay
  useDispatchedUpdates((update: DispatchedUpdate) => {
    // Check if we have new notifications or refresh needed
    const hasNewNotifications = update.notifications.length > 0;
    const needsRefresh = update.refreshNeeded;
    
    if (hasNewNotifications || needsRefresh) {
      console.log('[NotificationsPage] 📬 Received dispatched update - refetching notifications (notifications:', update.notifications.length, ', refresh:', needsRefresh, ')');
      // Re-fetch current page with active filter so server formats messages consistently
      // This happens after the buffer delay, ensuring all surfaces update together
      fetchNotifications();
    }
  });

  const navigateToNotification = (n: NotificationItem) => {
    // Navigate based on notification type and trigger highlighting (except for messages)
    if (n.type === 'message' && n.metadata?.conversationId) {
      const params = new URLSearchParams();
      params.set('open', n.metadata.conversationId);
      navigate(`/app/messages?${params.toString()}`);
      // No highlighting for messages - just redirect
    } else if (n.type === 'comment_added' && n.metadata?.postId) {
      const params = new URLSearchParams();
      if (n.metadata?.commentId) {
        params.set('highlight', n.metadata.commentId);
        console.log('[NotificationsPage] Navigating to comment:', { postId: n.metadata.postId, commentId: n.metadata.commentId });
      } else {
        console.warn('[NotificationsPage] comment_added notification missing commentId:', n);
      }
      const url = params.toString() ? `/app/feed/${n.metadata.postId}?${params.toString()}` : `/app/feed/${n.metadata.postId}`;
      console.log('[NotificationsPage] Navigation URL:', url);
      navigate(url);
      // PostDetail will read highlight param and highlight accordingly
    } else if (n.type === 'post_reaction_added' && n.metadata?.postId) {
      // Add highlight param to indicate navigation from notification
      navigate(`/app/feed/${n.metadata.postId}?highlight=post`);
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
      // PostDetail will read highlight/reply params and highlight accordingly
    } else if (n.type === 'post_created' && n.metadata?.postId) {
      // Add highlight param to indicate navigation from notification
      navigate(`/app/feed/${n.metadata.postId}?highlight=post`);
    } else if (n.type === 'connection_request' && (n.metadata?.userId || n.actor?._id)) {
      // Navigate to the sender's profile page where user can view details and accept/decline
      const userId = n.metadata?.userId || n.actor?._id;
      navigate(`/app/profile/${userId}`);
    } else if (n.type === 'collaboration_request' && n.metadata?.postId) {
      // Navigate to the post detail page where owner can approve/decline
      navigate(`/app/feed/${n.metadata.postId}`);
    } else if ((n.type === 'collaboration_request_approved' || n.type === 'collaboration_request_declined') && n.metadata?.postId) {
      // Navigate to the post detail page
      navigate(`/app/feed/${n.metadata.postId}`);
    }
    // connection_accepted is read-only - no navigation (intentionally removed)
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    // connection_accepted is read-only - no action on click
    if (n.type === 'connection_accepted') {
      return;
    }
    
    // Prevent re-navigation if this notification was already clicked
    if (n._id && clickedNotificationsRef.current.has(n._id)) {
      console.log('[NotificationsPage] Notification already clicked, skipping re-navigation:', n._id);
      return;
    }
    
    // Mark this notification as clicked
    if (n._id) {
      clickedNotificationsRef.current.add(n._id);
    }
    
    // Mark as read first if unread
    if (!n.read) {
      await markRead(n._id, true);
      // Note: markRead already fires refresh event, no need to fire again
    }
    navigateToNotification(n);
  };

  const handleAcceptConnection = async (n: NotificationItem) => {
    const userId = n.metadata?.userId || n.actor?._id;
    console.log('[NotificationsPage] Accept button clicked for notification:', n._id);
    console.log('[NotificationsPage] UserId:', userId);
    console.log('[NotificationsPage] Notification:', n);
    
    if (!userId || !n._id) {
      console.error('[NotificationsPage] Missing userId or notification ID:', { userId, notificationId: n._id });
      alert('Error: Missing user information. Please try again.');
      return;
    }
    
    try {
      console.log('[NotificationsPage] Calling /users/accept/' + userId);
      // Accept the connection request - server handles notification deletion
      const acceptResponse = await axios.post(`/users/accept/${userId}`);
      console.log('[NotificationsPage] Accept response:', acceptResponse.data);
      
      // Server handles deletion and emits refresh events
      // Just refresh the notification list to reflect server state
      await fetchNotifications();
      
      console.log('[NotificationsPage] Accept completed successfully');
    } catch (error: any) {
      console.error('[NotificationsPage] Failed to accept connection:', error);
      console.error('[NotificationsPage] Error details:', error.response?.data || error.message);
      console.error('[NotificationsPage] Error status:', error.response?.status);
      alert(`Failed to accept connection request: ${error.response?.data?.message || error.message || 'Unknown error'}. Please try again.`);
      // Refresh on error to ensure UI is in sync
      await fetchNotifications();
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
      await fetchNotifications();
    } catch (error) {
      console.error('Failed to decline connection:', error);
      // Refresh on error to ensure UI is in sync
      await fetchNotifications();
    }
  };

  const markRead = async (id: string, read: boolean) => {
    try {
      setItems(prev => prev.map(n => (n._id === id ? { ...n, read } : n)));
      await axios.put(`/notifications/${id}/read`, { read });
      console.log('[Notifications] Marked notification as read:', id, read);
      // Fire refresh event after successful API call to update bell icon count
      // Use setTimeout to ensure database update is complete before refetching
      setTimeout(() => {
        console.log('[Notifications] Firing refresh event after mark read');
        window.dispatchEvent(new Event('notifications:refresh-count'));
      }, 150);
    } catch (e) {
      console.error('[Notifications] Failed to mark notification as read:', e);
      // revert on error
      setItems(prev => prev.map(n => (n._id === id ? { ...n, read: !read } : n)));
    }
  };

  const deleteNotification = async (id: string, showUndo = true) => {
    const notification = items.find(n => n._id === id);
    if (!notification) return;

    // Remove from UI immediately
    setItems(prev => prev.filter(n => n._id !== id));
    setTotalCount(prev => Math.max(0, prev - 1));
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });

    // Show undo toast if requested
    if (showUndo) {
      const deleteTimeout = setTimeout(async () => {
        // Actually delete from backend after 5 seconds if not undone
        try {
          await axios.delete(`/notifications/${id}`);
          // Refetch notifications to get accurate count after grouping is recalculated
          await fetchNotifications();
          window.dispatchEvent(new Event('notifications:refresh-count'));
        } catch (e: any) {
          console.error('Failed to delete notification:', e);
          // Refetch on error too to ensure UI is in sync
          fetchNotifications();
        }
        setUndoStack(prev => prev.filter(item => item.id !== id));
      }, 5000);

      setUndoStack(prev => [...prev, { id, notification, timer: deleteTimeout }]);
      // Note: Refresh event is fired after actual deletion (inside timeout), not here
    } else {
      // Delete immediately if no undo
      try {
        await axios.delete(`/notifications/${id}`);
        // Refetch notifications to get accurate count after grouping is recalculated
        await fetchNotifications();
        window.dispatchEvent(new Event('notifications:refresh-count'));
      } catch (e: any) {
        console.error('Failed to delete notification:', e);
        // Refetch on error too to ensure UI is in sync
        fetchNotifications();
      }
    }
  };

  const undoDelete = (id: string) => {
    const undoItem = undoStack.find(item => item.id === id);
    if (!undoItem) return;

    // Clear the delete timeout
    clearTimeout(undoItem.timer);

    // Restore the notification in UI (no API call needed since it was never deleted)
    setItems(prev => [...prev, undoItem.notification].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
    setTotalCount(prev => prev + 1);
    setUndoStack(prev => prev.filter(item => item.id !== id));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map(n => n._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds);
    
    try {
      // Delete all selected notifications
      await Promise.all(idsToDelete.map(id => axios.delete(`/notifications/${id}`)));
      
      // Update UI immediately
      setItems(prev => prev.filter(n => !selectedIds.has(n._id)));
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      
      // Refetch notifications to get accurate count from server
      await fetchNotifications();
      
      // Refresh count in navbar
      window.dispatchEvent(new Event('notifications:refresh-count'));
    } catch (e: any) {
      console.error('Failed to bulk delete notifications:', e);
      // Refetch on error too to ensure UI is in sync
      fetchNotifications();
    }
  };

  const handleRightClick = (e: React.MouseEvent, notificationId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      notificationId,
      x: e.clientX,
      y: e.clientY
    });
  };
  
  const getContextMenuStyle = () => {
    if (!contextMenu) return {};
    
    const menuWidth = 160;
    const menuHeight = 80;
    const padding = 10;
    
    let left = contextMenu.x;
    let top = contextMenu.y;
    
    // Adjust if menu would overflow right edge
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - padding;
    }
    
    // Adjust if menu would overflow left edge
    if (left < padding) {
      left = padding;
    }
    
    // Adjust if menu would overflow bottom edge
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - padding;
    }
    
    // Adjust if menu would overflow top edge
    if (top < padding) {
      top = padding;
    }
    
    return { left: `${left}px`, top: `${top}px` };
  };

  const handleLongPressStart = (e: React.TouchEvent, notificationId: string) => {
    const timer = setTimeout(() => {
      const touch = e.touches[0];
      setContextMenu({
        notificationId,
        x: touch.clientX,
        y: touch.clientY
      });
    }, 500); // 500ms for long press
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('contextmenu', handleClickOutside);
      };
    }
  }, [contextMenu]);

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">Notifications</h1>
          <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)] mt-1">
            {totalCount} {totalCount === 1 ? 'notification' : 'notifications'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedIds(new Set());
            }}
            className="border border-secondary-300 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-[var(--link-color)]"
          >
            <option value="all">All</option>
            <option value="comment_added">Comments</option>
            <option value="post_reaction_added">Post Upvotes</option>
            <option value="reaction_added">Comment/Reply Upvotes</option>
            <option value="reply_added">Replies</option>
            <option value="connection_request">Connection Requests</option>
            <option value="connection_accepted">Connection Accepted</option>
            {/* Messages option removed - messages only appear in Messages dropdown */}
            <option value="post_created">New Posts</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg border border-secondary-200 dark:border-[var(--border-color)] shadow-sm">
        {loading && (
          <div className="p-4 text-sm text-secondary-600 dark:text-[var(--text-secondary)]">Loading…</div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-600">{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="p-6 text-sm text-secondary-600 dark:text-[var(--text-secondary)]">No notifications yet.</div>
        )}
        {items.length > 0 && (
          <div className="p-3 border-b border-secondary-200 dark:border-[var(--border-color)] flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(input) => {
                if (input) input.indeterminate = someSelected;
              }}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="w-4 h-4 text-[#2563EB] bg-white dark:bg-[var(--bg-card)] border-secondary-300 dark:border-[var(--border-color)] rounded focus:ring-primary-500 dark:focus:ring-[var(--link-color)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)] transition-colors"
              onClick={(e) => e.stopPropagation()}
            />
            <span className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
            </span>
          </div>
        )}
        {(() => {
          const grouped = groupNotificationsByTime(items);
          return (
            <>
              {grouped.map((group) => (
                <div key={group.timeGroup}>
                  {/* Time group header */}
                  <div className="px-4 py-2 bg-secondary-50 dark:bg-[var(--bg-hover)] border-b border-secondary-200 dark:border-[var(--border-color)] sticky top-0 z-10">
                    <span className="text-xs font-semibold text-secondary-600 dark:text-[var(--text-secondary)] uppercase tracking-wide">
                      {group.timeGroup}
                    </span>
                  </div>
                  {/* Notifications in this time group */}
                  <ul className="divide-y divide-secondary-200 dark:divide-[var(--border-color)]">
                    {group.notifications.map((n) => {
                      const isConnectionAccepted = n.type === 'connection_accepted';
                      const isClickable = !isConnectionAccepted;
                      
                      return (
                        <li
                          key={n._id}
                          className={`notification-item ${n.read ? '' : 'unread'} p-4 flex items-start gap-3 relative rounded-lg ${
                            selectedIds.has(n._id) ? 'bg-[#EFF6FF] dark:bg-[var(--bg-hover)]' : ''
                          } ${isClickable ? 'hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)]' : ''} ${
                            n.read ? '' : 'bg-[#EFF6FF] dark:bg-[var(--bg-hover)]'
                          }`}
                          onContextMenu={(e) => handleRightClick(e, n._id)}
                          onTouchStart={(e) => handleLongPressStart(e, n._id)}
                          onTouchEnd={handleLongPressEnd}
                          onTouchCancel={handleLongPressEnd}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(n._id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectItem(n._id, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-[#2563EB] bg-white dark:bg-[var(--bg-card)] border-secondary-300 dark:border-[var(--border-color)] rounded focus:ring-primary-500 dark:focus:ring-[var(--link-color)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
                          />
                          <div
                            className={`flex-1 ${isClickable ? 'cursor-pointer' : ''}`}
                            onClick={() => isClickable && handleNotificationClick(n)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative flex-shrink-0">
                                <img
                                  src={getProfileImageUrl(n.actor?.profilePicture) || '/default-avatar.png'}
                                  alt={n.actor?.name}
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                                {renderTypeBadge(n.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    {n.type === 'message' ? (
                                      <div className={`text-sm ${n.read ? 'text-secondary-900 dark:text-[var(--text-primary)] font-normal' : 'text-secondary-900 dark:text-[var(--text-primary)] font-normal'}`}>
                                        <div className="font-medium">{n.actor?.name}</div>
                                        <div className="mt-1 font-normal">{n.message}</div>
                                      </div>
                                    ) : (
                                      <p className={`text-sm ${n.read ? 'text-secondary-700 dark:text-[var(--text-secondary)] font-normal' : 'text-secondary-900 dark:text-[var(--text-primary)] font-semibold'}`}>
                                        {renderMessage(n.message, n.actor?.name, !!n.read)}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-xs text-secondary-500 dark:text-[var(--text-muted)] flex-shrink-0 whitespace-nowrap">
                                    {formatRelativeTime(n.createdAt)}
                                  </span>
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
                            </div>
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

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-lg border border-secondary-200 dark:border-[var(--border-color)] py-1 min-w-[160px]"
            style={getContextMenuStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm text-secondary-700 dark:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)]"
              onClick={() => {
                const notification = items.find(n => n._id === contextMenu.notificationId);
                if (notification) {
                  markRead(contextMenu.notificationId, !notification.read);
                }
                setContextMenu(null);
              }}
            >
              {items.find(n => n._id === contextMenu.notificationId)?.read ? 'Mark as unread' : 'Mark as read'}
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)]"
              onClick={() => {
                deleteNotification(contextMenu.notificationId, true);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {showBulkDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-secondary-200 dark:border-[var(--border-color)]">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)] mb-2">Delete Notifications?</h3>
              <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)] mb-6">
                Are you sure you want to delete {selectedIds.size} {selectedIds.size === 1 ? 'notification' : 'notifications'}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="px-4 py-2 text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] bg-secondary-100 dark:bg-[var(--bg-hover)] rounded-md hover:bg-secondary-200 dark:hover:bg-[var(--bg-panel)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Undo Snackbar */}
        {undoStack.length > 0 && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2">
            {undoStack.map((undoItem) => (
              <div
                key={undoItem.id}
                className="bg-secondary-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]"
              >
                <span className="flex-1 text-sm">Notification deleted</span>
                <button
                  onClick={() => undoDelete(undoItem.id)}
                  className="text-sm font-medium text-blue-400 hover:text-blue-300"
                >
                  Undo
                </button>
                <button
                  onClick={() => {
                    clearTimeout(undoItem.timer);
                    setUndoStack(prev => prev.filter(item => item.id !== undoItem.id));
                  }}
                  className="text-secondary-400 hover:text-white"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 flex items-center justify-between">
          <button
            className="text-sm px-3 py-1 rounded-md border border-secondary-300 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">Page {page}</span>
          <button
            className="text-sm px-3 py-1 rounded-md border border-secondary-300 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)]"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;


