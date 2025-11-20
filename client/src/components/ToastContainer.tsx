import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification, NotificationType } from '../contexts/NotificationContext';
import { getProfileImageUrl } from '../utils/image';
import { XMarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

/**
 * Global ToastContainer component that displays toasts globally across all routes
 * This component must be inside Router context to use navigate
 */
const ToastContainer: React.FC = () => {
  const { toasts, removeToast, pauseToastTimer, resumeToastTimer } = useNotification();
  const navigate = useNavigate();
  
  // Helper: Render message with actor name bolded if it appears in the text
  const renderMessage = (message: string, actorName: string | undefined) => {
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
    let bgColor = 'bg-gray-100 dark:bg-[var(--bg-hover)]';
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
  
  // Track hover state and truncation for each toast
  const [hoveredToast, setHoveredToast] = useState<string | null>(null);
  const [truncatedToasts, setTruncatedToasts] = useState<Set<string>>(new Set());
  const [scrollableToasts, setScrollableToasts] = useState<Set<string>>(new Set());
  const [scrollState, setScrollState] = useState<Map<string, { canScrollBottom: boolean }>>(new Map());
  const messageRefs = useRef<Map<string, HTMLParagraphElement>>(new Map());
  const scrollContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Track clicked toasts to prevent re-navigation when new notifications arrive
  const clickedToastsRef = useRef<Set<string>>(new Set());

  const handleToastClick = (toast: any) => {
    // Prevent re-navigation if this toast was already clicked
    if (clickedToastsRef.current.has(toast.id)) {
      console.log('[ToastContainer] Toast already clicked, skipping re-navigation:', toast.id);
      return;
    }
    
    // Mark this toast as clicked
    clickedToastsRef.current.add(toast.id);
    
    // Navigate based on notification type
    if (toast.type === 'message' && toast.metadata?.conversationId) {
      // If it's a room conversation, navigate to the room page
      if (toast.metadata?.isRoom && toast.metadata?.roomId) {
        navigate(`/app/room/${toast.metadata.roomId}`);
      } else {
        // Regular 1-on-1 conversation, navigate to Messages page
        navigate(`/app/messages?open=${toast.metadata.conversationId}`);
      }
      removeToast(toast.id);
    } else if (toast.type === 'comment_added' && toast.metadata?.postId) {
      const params = new URLSearchParams();
      if (toast.metadata?.commentId) {
        params.set('highlight', toast.metadata.commentId);
      }
      const url = params.toString() ? `/app/feed/${toast.metadata.postId}?${params.toString()}` : `/app/feed/${toast.metadata.postId}`;
      navigate(url);
      removeToast(toast.id);
    } else if (toast.type === 'post_reaction_added' && toast.metadata?.postId) {
      navigate(`/app/feed/${toast.metadata.postId}?highlight=post`);
      removeToast(toast.id);
    } else if (toast.type === 'reaction_added' && toast.metadata?.postId) {
      const params = new URLSearchParams();
      if (toast.metadata?.commentId) {
        params.set('highlight', toast.metadata.commentId);
      }
      if (toast.metadata?.replyId) {
        params.set('reply', toast.metadata.replyId);
      }
      const url = params.toString() ? `/app/feed/${toast.metadata.postId}?${params.toString()}` : `/app/feed/${toast.metadata.postId}`;
      navigate(url);
      removeToast(toast.id);
    } else if (toast.type === 'reply_added' && toast.metadata?.postId) {
      const params = new URLSearchParams();
      if (toast.metadata?.replyId) {
        params.set('reply', toast.metadata.replyId);
      }
      if (toast.metadata?.commentId) {
        params.set('highlight', toast.metadata.commentId);
      }
      const url = params.toString() ? `/app/feed/${toast.metadata.postId}?${params.toString()}` : `/app/feed/${toast.metadata.postId}`;
      navigate(url);
      removeToast(toast.id);
    // connection_accepted is read-only - no navigation on click
    // else if (toast.type === 'connection_accepted') - intentionally removed
    } else if (toast.type === 'post_created' && toast.metadata?.postId) {
      // Navigate to the new post
      navigate(`/app/feed/${toast.metadata.postId}?highlight=post`);
      removeToast(toast.id);
    } else if (toast.type === 'connection_request' && (toast.metadata?.userId || toast.actor?._id)) {
      // Navigate to the sender's profile page where user can accept/decline
      const userId = toast.metadata?.userId || toast.actor?._id;
      
      // Mark all unread connection_request notifications from this user as read
      // This ensures the bell count updates immediately
      axios.get('/notifications', { params: { page: 1, pageSize: 100 } })
        .then(res => {
          const notifications = res.data?.notifications || [];
          const unreadRequests = notifications.filter((n: any) => 
            n.type === 'connection_request' && 
            !n.read && 
            (n.metadata?.userId === userId || n.actor?._id === userId)
          );
          
          // Mark all matching notifications as read
          Promise.all(unreadRequests.map((n: any) => 
            axios.put(`/notifications/${n._id}/read`, { read: true })
          )).then(() => {
            // Refresh count after marking as read
            window.dispatchEvent(new Event('notifications:refresh-count'));
          }).catch(err => {
            console.error('Failed to mark connection request as read:', err);
          });
        })
        .catch(err => {
          console.error('Failed to fetch notifications:', err);
        });
      
      navigate(`/app/profile/${userId}`);
      removeToast(toast.id);
    } else if (toast.type === 'collaboration_request' && toast.metadata?.postId) {
      // Navigate to the post detail page where owner can approve/decline
      navigate(`/app/feed/${toast.metadata.postId}`);
      removeToast(toast.id);
    } else if ((toast.type === 'collaboration_request_approved' || toast.type === 'collaboration_request_declined') && toast.metadata?.postId) {
      // Navigate to the post detail page
      navigate(`/app/feed/${toast.metadata.postId}`);
      removeToast(toast.id);
    }
  };

  const handleAccept = async (toast: any) => {
    console.log('[ToastContainer] Accept button clicked for toast:', toast.id);
    console.log('[ToastContainer] Toast actions:', toast.actions);
    console.log('[ToastContainer] Toast metadata:', toast.metadata);
    
    if (toast.actions?.accept) {
      try {
        console.log('[ToastContainer] Calling accept action...');
        const success = await toast.actions.accept();
        console.log('[ToastContainer] Accept action result:', success);
        if (success) {
          // Remove toast after successful accept
          console.log('[ToastContainer] Removing toast after successful accept');
          removeToast(toast.id);
        } else {
          console.warn('[ToastContainer] Accept action returned false, keeping toast');
          // Keep toast visible so user can try again
        }
      } catch (error: any) {
        console.error('[ToastContainer] Error accepting connection:', error);
        console.error('[ToastContainer] Error details:', error.response?.data || error.message);
        // Don't remove toast on error - let user try again
      }
    } else {
      console.warn('[ToastContainer] No accept action found on toast');
      console.warn('[ToastContainer] Toast type:', toast.type);
      console.warn('[ToastContainer] Toast data:', JSON.stringify(toast, null, 2));
    }
  };

  const handleDecline = async (toast: any) => {
    console.log('[ToastContainer] Decline button clicked for toast:', toast.id);
    if (toast.actions?.decline) {
      try {
        const success = await toast.actions.decline();
        if (success) {
          // Remove toast after successful decline
          removeToast(toast.id);
        } else {
          console.warn('[ToastContainer] Decline action returned false, keeping toast');
        }
      } catch (error) {
        console.error('[ToastContainer] Error declining connection:', error);
        // Don't remove toast on error - let user try again
      }
    } else {
      console.warn('[ToastContainer] No decline action found on toast');
    }
  };

  // Check for text that exceeds max height (needs scrolling)
  useEffect(() => {
    const checkScrollability = () => {
      const newScrollable = new Set<string>();
      messageRefs.current.forEach((element, toastId) => {
        if (element && element.parentElement) {
          // Create a temporary clone to measure actual text height
          const clone = element.cloneNode(true) as HTMLElement;
          clone.style.visibility = 'hidden';
          clone.style.position = 'absolute';
          clone.style.width = `${element.parentElement.clientWidth - 40}px`; // Account for padding and avatar
          clone.style.maxWidth = 'none';
          clone.style.whiteSpace = 'normal';
          clone.style.wordBreak = 'break-word';
          clone.classList.remove('truncate');
          element.parentElement.appendChild(clone);
          
          // Measure the actual text height
          const actualHeight = clone.scrollHeight;
          const maxHeight = 128; // max-h-32 = 8rem = 128px
          
          // Remove clone
          clone.remove();
          
          // Check if text would exceed max height (needs scrolling)
          if (actualHeight > maxHeight) {
            newScrollable.add(toastId);
            // Also mark as truncated for the ellipsis hint
            setTruncatedToasts(prev => {
              const newSet = new Set(prev);
              newSet.add(toastId);
              return newSet;
            });
          }
        }

      });
      setScrollableToasts(newScrollable);
    };

    // Check immediately and after a short delay (to ensure DOM is ready)
    checkScrollability();
    const timeout = setTimeout(checkScrollability, 100);
    
    return () => {
      clearTimeout(timeout);
    };
  }, [toasts]);

  const handleMouseEnter = (toastId: string) => {
    setHoveredToast(toastId);
    pauseToastTimer(toastId);
    // Compute scroll state after render to avoid layout thrash
    setTimeout(() => {
      const container = scrollContainerRefs.current.get(toastId);
      if (container) {
        const canScrollBottom = container.scrollTop + container.clientHeight < container.scrollHeight - 2;
        setScrollState(prev => {
          const map = new Map(prev);
          map.set(toastId, { canScrollBottom });
          return map;
        });
      }
    }, 0);
  };

  const handleMouseLeave = (toastId: string) => {
    setHoveredToast(null);
    resumeToastTimer(toastId);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        const isInteractive = toast.type === 'connection_request';
        // connection_accepted is not clickable (read-only)
        const isClickable = toast.type !== 'connection_accepted' && (toast.metadata?.conversationId || toast.metadata?.postId || toast.metadata?.userId || toast.type === 'post_created');

        return (
          <div
            key={toast.id}
            onClick={(e) => {
              // Only navigate if clicking outside buttons area
              if (isClickable && !isInteractive) {
                handleToastClick(toast);
              } else if (isClickable && isInteractive) {
                // For connection requests, allow clicking outside buttons to navigate
                const target = e.target as HTMLElement;
                if (!target.closest('button')) {
                  handleToastClick(toast);
                }
              }
              // connection_accepted is non-clickable - do nothing
            }}
            className={`bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-lg border border-gray-200 dark:border-[var(--border-color)] p-3 min-w-[300px] max-w-[400px] transition-all pointer-events-auto animate-in slide-in-from-right-5 duration-300 ${
              isClickable ? 'cursor-pointer hover:shadow-xl' : ''
            } ${hoveredToast === toast.id ? 'shadow-xl' : ''}`}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                handleToastClick(toast);
              }
            }}
            onMouseEnter={() => handleMouseEnter(toast.id)}
            onMouseLeave={() => handleMouseLeave(toast.id)}
            onFocus={() => handleMouseEnter(toast.id)}
            onBlur={() => handleMouseLeave(toast.id)}
          >
            <div className="flex items-start gap-3">
              <div className="relative flex-shrink-0">
              <img
                src={getProfileImageUrl(toast.actor.profilePicture) || '/default-avatar.png'}
                alt={toast.actor.name}
                  className="h-10 w-10 rounded-full object-cover"
              />
                {renderTypeBadge(toast.type)}
              </div>
              <div className="flex-1 min-w-0">
                {toast.type === 'message' ? (
                  <div className="text-sm text-gray-900">
                    <div className="font-medium">{toast.actor.name}</div>
                    <div className="mt-1 text-gray-600 dark:text-[var(--text-secondary)] relative">
                  {/* Scrollable message container - only scrollable when hovered and exceeds max height */}
                  <div
                    ref={(el) => {
                      if (el) {
                        scrollContainerRefs.current.set(toast.id, el);
                        const p = el.querySelector('p');
                        if (p) {
                          messageRefs.current.set(toast.id, p);
                        }
                      } else {
                        scrollContainerRefs.current.delete(toast.id);
                        messageRefs.current.delete(toast.id);
                      }
                    }}
                    className={`text-sm text-gray-600 dark:text-[var(--text-secondary)] transition-[max-height] duration-200 ease-in-out relative ${
                      // Always cap initial height to avoid flash
                      'max-h-32 overflow-hidden'
                    } ${
                      // Expand on hover when scrollable
                      hoveredToast === toast.id && scrollableToasts.has(toast.id)
                        ? 'max-h-[40vh] overflow-y-auto scrollbar-hide'
                        : ''
                    } ${
                      // For non-scrollable, keep single-line truncation
                      !scrollableToasts.has(toast.id) ? 'truncate' : ''
                    }`}
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const canScrollBottom = target.scrollTop + target.clientHeight < target.scrollHeight - 2;
                      setScrollState(prev => {
                        const map = new Map(prev);
                        map.set(toast.id, { canScrollBottom });
                        return map;
                      });
                    }}
                    tabIndex={hoveredToast === toast.id && scrollableToasts.has(toast.id) ? 0 : undefined}
                    onKeyDown={(e) => {
                      // Allow arrow keys to scroll when focused
                      if (hoveredToast === toast.id && scrollableToasts.has(toast.id)) {
                        const container = scrollContainerRefs.current.get(toast.id);
                        if (container) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            container.scrollBy({ top: 20, behavior: 'smooth' });
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            container.scrollBy({ top: -20, behavior: 'smooth' });
                          } else if (e.key === 'PageDown') {
                            e.preventDefault();
                            container.scrollBy({ top: container.clientHeight, behavior: 'smooth' });
                          } else if (e.key === 'PageUp') {
                            e.preventDefault();
                            container.scrollBy({ top: -container.clientHeight, behavior: 'smooth' });
                          }
                        }
                      }
                    }}
                  >
                    <p
                      className="whitespace-normal break-words"
                      title={scrollableToasts.has(toast.id) && hoveredToast !== toast.id ? toast.message : undefined}
                      aria-label={scrollableToasts.has(toast.id) ? `Full message: ${toast.message}` : undefined}
                    >
                      {toast.message}
                    </p>
                  </div>
                  
                  {/* Visual indicators for scrollable content */}
                  {scrollableToasts.has(toast.id) && (
                    <>
                      {/* Subtle bottom fade before hover to hint more content */}
                      {hoveredToast !== toast.id && (scrollState.get(toast.id)?.canScrollBottom ?? true) && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none opacity-60"
                          aria-hidden="true"
                        />
                      )}
                      {/* Stronger bottom fade on hover while scrolling */}
                      {hoveredToast === toast.id && (scrollState.get(toast.id)?.canScrollBottom ?? true) && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}
                  
                  {/* Subtle hint when not hovered */}
                  {scrollableToasts.has(toast.id) && hoveredToast !== toast.id && (
                    <span className="text-xs text-gray-400 dark:text-[var(--text-muted)] ml-1 absolute right-0 bottom-0" aria-hidden="true" title="Hover to scroll and read full message">…</span>
                  )}
                </div>
                  </div>
                ) : (
                  <div className="relative">
                    <p className="text-sm text-gray-900 dark:text-[var(--text-primary)]">
                      {renderMessage(toast.message, toast.actor.name)}
                    </p>
                  </div>
                )}
                
                {/* Interactive buttons for connection requests */}
                {isInteractive && toast.actions && (
                  <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAccept(toast);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Accept
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDecline(toast);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-[var(--text-primary)] bg-gray-100 dark:bg-[var(--bg-hover)] rounded-md hover:bg-gray-200 dark:hover:bg-[var(--bg-panel)] transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-[var(--link-color)]"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-full flex-shrink-0 transition-colors"
                aria-label="Close notification"
              >
                <XMarkIcon className="h-4 w-4 text-gray-500 dark:text-[var(--icon-color)]" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;


