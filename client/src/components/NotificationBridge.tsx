import React, { useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNotification, NotificationType } from '../contexts/NotificationContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useNotificationDispatcher, useDispatchedUpdates } from '../contexts/NotificationDispatcherContext';
import { DispatchedUpdate } from '../services/NotificationDispatcher';

/**
 * Bridge component that connects SocketContext with NotificationContext
 * Handles all notification types (messages, connection requests, comments, reactions)
 */
const NotificationBridge: React.FC = () => {
  const { showToast } = useNotification();
  const { socket, registerNotificationCallback } = useSocket();
  const { user } = useAuth();
  const { preferences, isDoNotDisturbActive } = useNotificationPreferences();
  const dispatcher = useNotificationDispatcher();
  
  // Note: Deduplication is now handled by NotificationDispatcher, so we don't need shownMessageIdsRef
  
  // Helper function to get current location (works outside Router context)
  const getCurrentLocation = useCallback(() => {
    return {
      pathname: window.location.pathname,
      search: window.location.search
    };
  }, []);

  // Map backend notification types to preference keys
  const getNotificationPreferenceKey = useCallback((type: NotificationType): keyof typeof preferences.notificationTypes | null => {
    switch (type) {
      case 'connection_request':
        return 'connectionRequest';
      case 'connection_accepted':
        return 'connectionAccepted';
      case 'post_created':
        return 'newPost';
      case 'comment_added':
        return 'commentAdded';
      case 'post_reaction_added':
        return 'postUpvote';
      case 'reaction_added':
        return 'commentReplyUpvote';
      case 'reply_added':
        return 'replyAdded';
      case 'message':
        return 'message';
      case 'collaboration_request':
      case 'collaboration_request_approved':
      case 'collaboration_request_declined':
        return 'connectionRequest'; // Use connectionRequest preference for collaboration requests
      default:
        return null;
    }
  }, [preferences.notificationTypes]);

  // Format notification message based on type
  const formatNotificationMessage = useCallback((type: NotificationType, actorName: string, metadata: any, currentUserName?: string): string => {
    const postOwnerName = metadata?.postOwnerName;
    const isReplyToReply = metadata?.isReplyToReply;

    switch (type) {
      case 'connection_request':
        return `${actorName} sent you a connection request`;
      case 'connection_accepted':
        return `You're now connected with ${actorName}`;
      case 'post_created':
        // New post from connection
        const isMentioned = metadata?.isMentioned;
        if (isMentioned) {
          return `${actorName} mentioned you in a post: ${metadata?.title || 'New post'}`;
        }
        return `${actorName} shared a new post: ${metadata?.title || 'New post'}`;
      case 'comment_added':
        return `${actorName} commented on your post`;
      case 'post_reaction_added':
        return `${actorName} upvoted your post`;
      case 'reaction_added':
        // For comment/reply upvotes: "Mary upvoted your comment on Ana's post"
        const isReplyUpvote = metadata?.replyId;
        if (isReplyUpvote) {
          // Reply upvote: "Mary upvoted your reply on Ana's post"
          if (postOwnerName && postOwnerName !== 'Unknown') {
            return `${actorName} upvoted your reply on ${postOwnerName}'s post`;
          }
          return `${actorName} upvoted your reply`;
        } else {
          // Comment upvote: "Mary upvoted your comment on Ana's post"
          if (postOwnerName && postOwnerName !== 'Unknown') {
            return `${actorName} upvoted your comment on ${postOwnerName}'s post`;
          }
          return `${actorName} upvoted your comment`;
        }
      case 'reply_added':
        // Determine message based on recipient type from metadata
        const recipientType = metadata?.recipientType;
        
        console.log('[NotificationBridge] Reply notification metadata:', {
          recipientType,
          postOwnerName,
          metadata: JSON.stringify(metadata)
        });
        
        if (recipientType === 'post_owner') {
          // Post owner notification: "replied to a comment thread on your post" if reply-to-reply, else "replied to a comment on your post"
          console.log('[NotificationBridge] Using post_owner message format');
          const isReplyToReply = metadata?.isReplyToReply === true;
          if (isReplyToReply) {
            return `${actorName} replied to a comment thread on your post`;
          }
          return `${actorName} replied to a comment on your post`;
        } else if (recipientType === 'reply_owner') {
          // Reply owner notification: "Luke replied to your reply on Ana's post"
          // Only show post owner name if the recipient is NOT the post owner
          console.log('[NotificationBridge] Using reply_owner message format');
          
          // Prefer server-provided flag if available (more reliable)
          const isRecipientPostOwner = metadata?.isRecipientPostOwner === true || 
            (currentUserName && postOwnerName && currentUserName.toLowerCase() === postOwnerName.toLowerCase());
          
          if (postOwnerName && postOwnerName !== 'Unknown' && !isRecipientPostOwner) {
            const possessive = postOwnerName.endsWith('s') ? `${postOwnerName}'` : `${postOwnerName}'s`;
            return `${actorName} replied to your reply on ${possessive} post`;
          }
          
          return `${actorName} replied to your reply`;
        } else if (recipientType === 'comment_owner') {
          // Comment owner notification: "replied in a thread on your comment" if reply-to-reply, else "replied to your comment"
          console.log('[NotificationBridge] Using comment_owner message format');
          const isReplyToReply = metadata?.isReplyToReply === true;
          
          if (isReplyToReply) {
            // Threaded reply
            if (postOwnerName && postOwnerName !== 'Unknown') {
              const possessive = postOwnerName.endsWith('s') ? `${postOwnerName}'` : `${postOwnerName}'s`;
              return `${actorName} replied in a thread on your comment on ${possessive} post`;
            }
            return `${actorName} replied in a thread on your comment`;
          }
          
          // Regular reply (not threaded)
          if (postOwnerName && postOwnerName !== 'Unknown') {
            return `${actorName} replied to your comment on ${postOwnerName}'s post`;
          }
          return `${actorName} replied to your comment`;
        } else {
          // Fallback: If recipientType is missing/undefined, use generic safe message
          // This should not happen, but handle gracefully
          console.warn('[NotificationBridge] ⚠️ Missing or invalid recipientType:', recipientType);
          console.warn('[NotificationBridge] Using fallback message format');
          return `${actorName} replied to a comment`;
        }
      case 'message':
        return metadata?.messageContent || 'New message';
      default:
        return 'New notification';
    }
  }, []);

  // Connection request handlers (server handles deletion now)
  const handleAcceptConnection = React.useCallback(async (userId: string): Promise<boolean> => {
    try {
      console.log('[NotificationBridge] Accepting connection request from:', userId);
      const response = await axios.post(`/users/accept/${userId}`);
      console.log('[NotificationBridge] Connection accepted:', response.data);
      // Server handles notification deletion and emits refresh events
      return true;
    } catch (error: any) {
      console.error('[NotificationBridge] Failed to accept connection:', error);
      if (error.response) {
        console.error('[NotificationBridge] Error response:', error.response.data);
      }
      return false;
    }
  }, []);

  const handleDeclineConnection = React.useCallback(async (userId: string): Promise<boolean> => {
    try {
      console.log('[NotificationBridge] Declining connection request from:', userId);
      const response = await axios.post(`/users/decline/${userId}`);
      console.log('[NotificationBridge] Connection declined:', response.data);
      // Server handles notification deletion and emits refresh events
      return true;
    } catch (error: any) {
      console.error('[NotificationBridge] Failed to decline connection:', error);
      if (error.response) {
        console.error('[NotificationBridge] Error response:', error.response.data);
      }
      return false;
    }
  }, []);

  useEffect(() => {

    if (!socket || !user) {
      console.log('[NotificationBridge] Socket or user not available:', { socket: !!socket, user: !!user });
      return;
    }

    console.log('[NotificationBridge] Setting up notification listeners for user:', user._id);

    // Register callback for message notifications
    // CRITICAL: Route through dispatcher instead of showing toast immediately
    // This ensures all notification surfaces (toaster, dropdown, inbox, bell) update together
    registerNotificationCallback((data) => {
      const messageId = String(data.messageId || '');
      
      // Check if in-app alerts are disabled (early exit for efficiency)
      if (!preferences.inAppAlerts) {
        console.log('[NotificationBridge] ⚠️ In-app alerts disabled - skipping message notification');
        return;
      }

      // Check if Do Not Disturb is active (early exit for efficiency)
      if (isDoNotDisturbActive()) {
        console.log('[NotificationBridge] ⚠️ Do Not Disturb is active - skipping message notification');
        return;
      }

      // Check if message notifications are enabled (early exit for efficiency)
      if (!preferences.notificationTypes.message) {
        console.log('[NotificationBridge] ⚠️ Message notifications disabled - skipping');
        return;
      }

      // CRITICAL: Skip if conversation is muted (check isMuted flag from server)
      if (data.isMuted || data.metadata?.isMuted) {
        console.log('[NotificationBridge] 🔇 Conversation is muted - suppressing alerts:', data.conversationId);
        // Still allow unread counts and inbox updates, just suppress alerts
        return;
      }

      // CRITICAL: Skip if user is actively viewing this conversation
      // This check happens here to avoid unnecessary dispatcher overhead
      const activeConversationId = typeof window !== 'undefined' ? window.__activeConversationId : undefined;
      const isTabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      
      // Check if user is viewing the conversation in Messages page
      const isViewingInMessages = isTabVisible && activeConversationId === data.conversationId;
      
      // Check if user is viewing the room (for room conversations)
      // Room conversations have conversationId = room's conversation ID
      // We need to check if user is on /app/room/:roomId page
      const isViewingRoom = isTabVisible && currentPath.includes('/app/room/');
      
      // For room conversations, we need to check if the roomId matches
      // Since we don't have roomId in the callback data, we'll check the path
      // If user is in any room, we'll be more lenient and show the notification
      // unless we can definitively determine they're viewing this specific conversation
      
      if (isViewingInMessages) {
        console.log('[NotificationBridge] ⚠️ Skipping message notification - user is actively viewing conversation in Messages:', data.conversationId);
        return;
      }
      
      // For room conversations: if user is in a room page, we still show the notification
      // because they might be in a different room. The toast will help them know which room has new messages.

      // Fetch conversation info to get room name or other participant name for context
      // This is done asynchronously so it doesn't block the notification
      const fetchConversationContext = async () => {
        try {
          // Get conversation from the list endpoint (which includes room metadata)
          const response = await axios.get('/messages/conversations');
          if (response.data.success && response.data.conversations) {
            const conv = response.data.conversations.find((c: any) => c._id === data.conversationId);
            if (conv) {
              return {
                isRoom: conv.isRoom || false,
                roomName: conv.roomName || null,
                roomId: conv.roomId || null,
                otherParticipant: conv.otherParticipant || null
              };
            }
          }
        } catch (error) {
          console.error('[NotificationBridge] Failed to fetch conversation context:', error);
        }
        return null;
      };
      
      // Route through dispatcher for buffering and coalescing
      // The dispatcher will handle showing the toast after BUFFER_DELAY_MS
      // This ensures all notification surfaces update together
      console.log('[NotificationBridge] 🔔 Received message notification (routing through dispatcher):', messageId);
      
      // Fetch conversation context asynchronously
      fetchConversationContext().then(context => {
        // Format message with context
        let messageText = '';
        
        if (preferences.showPreview) {
          // Show preview with sender name
          messageText = data.message;
        } else {
          // No preview - show context
          if (context) {
            if (context.isRoom && context.roomName) {
              // Room conversation: "John sent a message in Project Room"
              messageText = `${data.senderName} sent a message in ${context.roomName}`;
            } else if (context.otherParticipant) {
              // 1-on-1 conversation: "John sent a message"
              messageText = `${data.senderName} sent a message`;
            } else {
              messageText = 'New message';
            }
          } else {
            // Fallback if context fetch fails
            messageText = `${data.senderName} sent a message`;
          }
        }
        
        console.log('[NotificationBridge] 🔔 Dispatching message notification:', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          senderName: data.senderName,
          isRoom: context?.isRoom || false,
          roomName: context?.roomName || null,
          messageText
        });
        
        dispatcher.dispatch({
          type: 'notification',
          payload: {
            type: 'message',
            actor: {
              _id: data.senderId || '',
              name: data.senderName,
              profilePicture: data.senderAvatar,
            },
            metadata: {
              conversationId: data.conversationId,
              messageId: data.messageId,
              messageContent: data.message,
              shouldSkipToaster: false, // Will be checked again in handleDispatchedUpdate
              isRoom: context?.isRoom || false,
              roomName: context?.roomName || null,
              roomId: context?.roomId || null,
            },
            message: messageText,
            timestamp: new Date().toISOString(),
            read: false,
          },
          timestamp: Date.now(),
          source: 'socket:message:new',
        });
      }).catch((error) => {
        console.error('[NotificationBridge] Error fetching conversation context:', error);
        // If context fetch fails, still dispatch without context
        dispatcher.dispatch({
          type: 'notification',
          payload: {
            type: 'message',
            actor: {
              _id: data.senderId || '',
              name: data.senderName,
              profilePicture: data.senderAvatar,
            },
            metadata: {
              conversationId: data.conversationId,
              messageId: data.messageId,
              messageContent: data.message,
              shouldSkipToaster: false,
            },
            message: preferences.showPreview ? data.message : 'New message',
            timestamp: new Date().toISOString(),
            read: false,
          },
          timestamp: Date.now(),
          source: 'socket:message:new',
        });
      });
    });

    // Listen for new notification events (all types)
    // Route through unified dispatcher for buffering and coalescing
    const handleNotification = (data: {
      type: NotificationType;
      actor: { _id: string; name: string; profilePicture?: string };
      metadata: any;
      timestamp: string;
      message?: string; // Server-provided message (preferred)
      read?: boolean; // Read status from server
      isMuted?: boolean; // Mute status from server
    }) => {
      console.log('[NotificationBridge] 🔔 Received notification event (routing through dispatcher):', data);
      
      // CRITICAL: Skip if conversation is muted (for message notifications)
      // Server already sets isMuted flag in metadata, but check here as well for safety
      if (data.type === 'message' && (data.metadata?.isMuted || data.isMuted)) {
        console.log('[NotificationBridge] 🔇 Conversation is muted - suppressing alerts:', data.metadata?.conversationId);
        // Still allow unread counts and inbox updates, just suppress alerts
        // Don't dispatch to dispatcher to prevent toast from showing
        return;
      }
      
      // Route through dispatcher for buffering and coalescing
      dispatcher.dispatch({
        type: 'notification',
        payload: data,
        timestamp: Date.now(),
        source: 'socket:notification',
      });
    };

    // Always attach listener - socket will buffer events until connected
    console.log('[NotificationBridge] ✅ Adding notification listener');
    socket.on('notification', handleNotification);
    
    // Listen for refresh-count events from server (e.g., after accept/decline)
    // Only listen to socket events from server, NOT window events (to avoid loops)
    const handleRefreshCount = () => {
      console.log('[NotificationBridge] Refresh count event received from server socket');
      // Dispatch refresh event through dispatcher
      // The dispatcher will set refreshNeeded flag, which will trigger window event in handleDispatchedUpdate
      dispatcher.dispatch({
        type: 'notification:refresh',
        payload: {},
        timestamp: Date.now(),
        source: 'socket:refresh-count',
      });
    };
    
    // Listen for socket refresh-count events (emitted by server)
    socket.on('notifications:refresh-count', handleRefreshCount);
    
    // DON'T listen to window events here - that would create a loop
    // Window events are handled by Navbar directly (loadCount)
    
    return () => {
      console.log('[NotificationBridge] Cleaning up notification listeners');
      socket.off('notification', handleNotification);
      socket.off('notifications:refresh-count', handleRefreshCount);
    };
  }, [socket, user, showToast, registerNotificationCallback, preferences, isDoNotDisturbActive, dispatcher]);

  // Subscribe to dispatched updates from unified dispatcher
  const handleDispatchedUpdate = useCallback((update: DispatchedUpdate) => {
    console.log('[NotificationBridge] 📬 Received dispatched update:', {
      notifications: update.notifications.length,
      statusUpdates: update.statusUpdates.size,
      countUpdates: update.countUpdates,
    });

    // Process notifications from dispatched update
    update.notifications.forEach((data: any) => {
      // Skip refresh events (they're handled separately via refreshNeeded flag)
      if (data.type === 'notification:refresh') {
        return;
      }

      // Validate notification has required fields
      if (!data.actor || !data.type) {
        console.warn('[NotificationBridge] ⚠️ Skipping invalid notification (missing actor or type):', data);
        return;
      }

      // Apply preference and visibility checks
      if (!preferences.inAppAlerts) {
        console.log('[NotificationBridge] ⚠️ In-app alerts disabled - skipping notification');
        return;
      }

      if (isDoNotDisturbActive()) {
        console.log('[NotificationBridge] ⚠️ Do Not Disturb is active - skipping notification');
        return;
      }

      // Check notification type preference
      const preferenceKey = getNotificationPreferenceKey(data.type);
      if (preferenceKey && !preferences.notificationTypes[preferenceKey]) {
        console.log('[NotificationBridge] ⚠️ Notification type disabled:', data.type);
        return;
      }
      
      // CRITICAL: Skip if conversation is muted (for message notifications)
      if (data.type === 'message' && (data.metadata?.isMuted || data.isMuted)) {
        console.log('[NotificationBridge] 🔇 Conversation is muted - suppressing alerts:', data.metadata?.conversationId);
        // Still allow unread counts and inbox updates, just suppress alerts
        return;
      }
      
      // Don't show notifications for the current user's own actions
      const actorId = String(data.actor?._id || '');
      const userId = String(user?._id || '');
      
      if (userId && actorId && actorId === userId && data.type !== 'connection_accepted') {
        console.log('[NotificationBridge] ⚠️ Ignoring notification from self');
        return;
      }
      
      // Format notification message
      let message = data.message || formatNotificationMessage(data.type, data.actor.name, data.metadata, user?.name);
      
      // Remove preview if preferences.showPreview is false
      if (!preferences.showPreview && data.metadata?.preview) {
        const previewText = data.metadata.preview;
        message = message
          .replace(`: "${previewText}"`, '')
          .replace(`"${previewText}"`, '')
          .replace(`: ${previewText}`, '')
          .replace(previewText, '')
          .trim();
        message = message.replace(/:\s*$/, '').trim();
      } else if (!preferences.showPreview && data.type === 'message') {
        message = 'New message';
      }
      
      // For message notifications: Don't show toaster if user is viewing the conversation
      if (data.type === 'message') {
        const location = getCurrentLocation();
        const activeConversationId = typeof window !== 'undefined' ? window.__activeConversationId : undefined;
        const isTabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
        const currentPath = location.pathname;
        
        // Check if viewing in Messages page
        const isViewingInMessages = isTabVisible && 
          (activeConversationId === data.metadata?.conversationId ||
           (currentPath.includes('/messages') && new URLSearchParams(location.search).get('open') === data.metadata?.conversationId));
        
        // Check if viewing in room page (for room conversations)
        // If it's a room conversation and user is in a room, check if it's the same room
        const isViewingInRoom = isTabVisible && currentPath.includes('/app/room/');
        let isViewingSameRoom = false;
        
        if (isViewingInRoom && data.metadata?.isRoom && data.metadata?.roomId) {
          // Extract roomId from path: /app/room/:roomId
          const pathRoomId = currentPath.split('/app/room/')[1]?.split('/')[0];
          isViewingSameRoom = pathRoomId === data.metadata.roomId;
        }
        
        const shouldSkipToasterForMessage = 
          data.metadata?.shouldSkipToaster === true ||
          isViewingInMessages ||
          (isViewingInRoom && isViewingSameRoom);
        
        if (shouldSkipToasterForMessage) {
          console.log('[NotificationBridge] ⚠️ Skipping toaster for message notification - user is actively viewing conversation', {
            conversationId: data.metadata?.conversationId,
            activeConversationId,
            isViewingInMessages,
            isViewingInRoom,
            isViewingSameRoom,
            roomId: data.metadata?.roomId
          });
          
          // Mark as read client-side if needed
          if (data.read !== true && activeConversationId === data.metadata?.conversationId && data.metadata?.notificationId) {
            axios.put(`/notifications/${data.metadata.notificationId}/read`, { read: true })
              .then(() => {
                window.dispatchEvent(new Event('notifications:refresh-count'));
              })
              .catch((error) => {
                console.error('[NotificationBridge] ❌ Failed to mark notification as read:', error);
              });
          }
          return;
        }
      }
      
      const toastData: any = {
        type: data.type,
        actor: data.actor,
        message,
        metadata: data.metadata,
      };

      // Add interactive actions for connection requests
      if (data.type === 'connection_request') {
        const userId = data.metadata?.userId || data.actor?._id;
        if (userId) {
          toastData.actions = {
            accept: async () => {
              try {
                const success = await handleAcceptConnection(userId);
                if (success && preferences.inAppAlerts && !isDoNotDisturbActive() && preferences.notificationTypes.connectionAccepted) {
                  showToast({
                    type: 'connection_accepted',
                    actor: data.actor,
                    message: `You're now connected with ${data.actor.name}`,
                    metadata: { userId: data.actor._id }
                  });
                }
                return success;
              } catch (error: any) {
                console.error('[NotificationBridge] Error in accept action:', error);
                return false;
              }
            },
            decline: async () => {
              try {
                return await handleDeclineConnection(userId);
              } catch (error: any) {
                console.error('[NotificationBridge] Error in decline action:', error);
                return false;
              }
            },
          };
        }
      }

      console.log('[NotificationBridge] 🎯 Showing toast from dispatched update:', toastData.type);
      showToast(toastData);
    });

    // Handle refresh events (from refreshNeeded flag, not from notifications array)
    if (update.refreshNeeded) {
      console.log('[NotificationBridge] 🔄 Refresh needed - triggering count refresh');
      window.dispatchEvent(new Event('notifications:refresh-count'));
    }
  }, [preferences, isDoNotDisturbActive, user, showToast, handleAcceptConnection, handleDeclineConnection, getNotificationPreferenceKey, formatNotificationMessage, getCurrentLocation]);

  useDispatchedUpdates(handleDispatchedUpdate);

  return null; // This component doesn't render anything
};

export default NotificationBridge;

