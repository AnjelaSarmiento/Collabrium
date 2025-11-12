/**
 * Helper function to safely extract user ID from populated or unpopulated author/user objects
 * @param {Object|String} user - User object (populated or unpopulated) or user ID string
 * @returns {String|null} - User ID as string, or null if invalid
 */
function getId(user) {
  if (!user) return null;
  if (typeof user === 'string') return user;
  if (user._id) return String(user._id);
  if (user.toString) return String(user);
  return null;
}

/**
 * Format notification message based on type and metadata
 * This is the single source of truth for notification message formatting
 * @param {String} type - Notification type
 * @param {String} actorName - Name of the user who triggered the notification
 * @param {Object} metadata - Notification metadata
 * @returns {String} - Formatted notification message
 */
function formatNotificationMessage(type, actorName, metadata = {}) {
  try {
    // Ensure type and actorName are strings
    type = type || 'unknown';
    actorName = actorName || 'Someone';
    
    // Ensure metadata is an object
    if (!metadata || typeof metadata !== 'object') {
      metadata = {};
    }
    
    const postOwnerName = metadata?.postOwnerName;
    const isReplyToReply = metadata?.isReplyToReply;

    switch (type) {
      case 'connection_request':
        return `${actorName} sent you a connection request`;
      case 'connection_accepted':
        return `You're now connected with ${actorName}`;
      case 'post_created': {
        const isMentioned = metadata?.isMentioned;
        const title = metadata?.title || 'New post';
        if (isMentioned) {
          return `${actorName} mentioned you in a post: "${title}"`;
        }
        return `${actorName} shared a new post: "${title}"`;
      }
      case 'comment_added': {
        // Use preview from metadata if available (standardized key)
        const preview = metadata?.preview || metadata?.commentContent;
        if (preview) {
          const truncated = preview.length > 100 ? preview.substring(0, 100) + '...' : preview;
          return `${actorName} commented on your post: "${truncated}"`;
        }
        return `${actorName} commented on your post`;
      }
      case 'post_reaction_added':
        return `${actorName} upvoted your post`;
      case 'reaction_added': {
        const isReplyUpvote = metadata?.replyId;
        if (isReplyUpvote) {
          if (postOwnerName && postOwnerName !== 'Unknown') {
            return `${actorName} upvoted your reply on ${postOwnerName}'s post`;
          }
          return `${actorName} upvoted your reply`;
        }
        if (postOwnerName && postOwnerName !== 'Unknown') {
          return `${actorName} upvoted your comment on ${postOwnerName}'s post`;
        }
        return `${actorName} upvoted your comment`;
      }
      case 'reply_added': {
        const recipientType = metadata?.recipientType;
        const isRecipientPostOwner = metadata?.isRecipientPostOwner === true;
        const isReplyToReply = metadata?.isReplyToReply === true;
        // Use preview from metadata if available (standardized key)
        const preview = metadata?.preview || metadata?.replyContent;
        const contentSnippet = preview ? (preview.length > 80 ? preview.substring(0, 80) + '...' : preview) : null;
        
        if (recipientType === 'post_owner') {
          // Post owner: "replied to a comment thread on your post" if reply-to-reply, else "replied to a comment on your post"
          if (isReplyToReply) {
            return contentSnippet ? `${actorName} replied to a comment thread on your post: "${contentSnippet}"` : `${actorName} replied to a comment thread on your post`;
          }
          return contentSnippet ? `${actorName} replied to a comment on your post: "${contentSnippet}"` : `${actorName} replied to a comment on your post`;
        } else if (recipientType === 'reply_owner') {
          // Reply owner: "replied to your reply on <postOwner>'s post" (or just "replied to your reply" if recipient is post owner)
          if (postOwnerName && postOwnerName !== 'Unknown' && !isRecipientPostOwner) {
            const possessive = postOwnerName.endsWith('s') ? `${postOwnerName}'` : `${postOwnerName}'s`;
            return contentSnippet ? `${actorName} replied to your reply on ${possessive} post: "${contentSnippet}"` : `${actorName} replied to your reply on ${possessive} post`;
          }
          return contentSnippet ? `${actorName} replied to your reply: "${contentSnippet}"` : `${actorName} replied to your reply`;
        } else if (recipientType === 'comment_owner') {
          // Comment owner: "replied in a thread on your comment" if reply-to-reply, else "replied to your comment"
          if (isReplyToReply) {
            // Threaded reply
            if (postOwnerName && postOwnerName !== 'Unknown') {
              const possessive = postOwnerName.endsWith('s') ? `${postOwnerName}'` : `${postOwnerName}'s`;
              return contentSnippet ? `${actorName} replied in a thread on your comment on ${possessive} post: "${contentSnippet}"` : `${actorName} replied in a thread on your comment on ${possessive} post`;
            }
            return contentSnippet ? `${actorName} replied in a thread on your comment: "${contentSnippet}"` : `${actorName} replied in a thread on your comment`;
          }
          // Regular reply (not threaded)
          if (postOwnerName && postOwnerName !== 'Unknown') {
            return contentSnippet ? `${actorName} replied to your comment on ${postOwnerName}'s post: "${contentSnippet}"` : `${actorName} replied to your comment on ${postOwnerName}'s post`;
          }
          return contentSnippet ? `${actorName} replied to your comment: "${contentSnippet}"` : `${actorName} replied to your comment`;
        }
        return contentSnippet ? `${actorName} replied to a comment: "${contentSnippet}"` : `${actorName} replied to a comment`;
      }
      case 'message': {
        // For messages, don't include name in message (handled separately on frontend)
        const messageContent = metadata?.messageContent || metadata?.preview;
        if (messageContent) {
          const truncated = messageContent.length > 120 ? messageContent.substring(0, 120) + '...' : messageContent;
          return truncated;
        }
        return 'sent you a message';
      }
      case 'collaboration_request': {
        const title = metadata?.title || 'your post';
        return `${actorName} wants to collaborate on your post: "${title}"`;
      }
      case 'collaboration_request_approved': {
        const title = metadata?.title || 'the post';
        return `${actorName} approved your collaboration request for "${title}"`;
      }
      case 'collaboration_request_declined': {
        const title = metadata?.title || 'the post';
        return `${actorName} declined your collaboration request for "${title}"`;
      }
      default:
        console.warn('[formatNotificationMessage] ⚠️ Unknown notification type:', type);
        return 'New notification';
    }
  } catch (formatErr) {
    console.error('[formatNotificationMessage] Error formatting notification message:', formatErr, { type, actorName, metadata });
    return 'New notification';
  }
}

/**
 * Standardized notification sender - ALWAYS creates DB record AND emits socket event
 * 
 * This is the single source of truth for sending notifications. It guarantees:
 * 1. Database record is created (if saveToDb is true)
 * 2. Socket event is emitted to user:<recipientId> room
 * 3. Returns the saved notification object
 * 
 * Usage:
 *   const notification = await sendNotification(req, {
 *     type: 'comment_added',
 *     recipientId: targetUserId,
 *     actor: req.user,
 *     metadata: { postId, commentId, recipientType: 'post_owner', preview: '...' }
 *   });
 * 
 * @param {Object} req - Express request object (must have app.get('io'))
 * @param {Object} options - Notification options
 * @param {String} options.type - Notification type (connection_request, connection_accepted, comment_added, reply_added, reaction_added, post_reaction_added, message, post_created)
 * @param {String} options.recipientId - User ID of the notification recipient
 * @param {Object} options.actor - User object who triggered the notification
 * @param {Object} options.metadata - Additional data (postId, commentId, replyId, recipientType, preview, etc.)
 * @param {Boolean} options.saveToDb - Whether to persist to database (default: true)
 * @returns {Object|null} - Saved notification object, or null if skipped/failed
 */
async function sendNotification(req, options) {
  const { type, recipientId, actor, metadata = {}, saveToDb = true, read = false } = options;
  
  // Generate a unique call ID for tracking duplicates
  const callId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const callStack = new Error().stack?.split('\n').slice(2, 6).join(' -> ') || 'unknown';
  
  console.log(`[sendNotification] 📞 Call ID: ${callId} | Type: ${type} | Recipient: ${recipientId}`);
  console.log(`[sendNotification] 📞 Call stack: ${callStack}`);
  
  // Validate required parameters
  if (!req || !recipientId || !actor) {
    console.warn(`[sendNotification] ⚠️ [${callId}] Missing required parameters:`, { type, recipientId, actor });
    return null;
  }

  const io = req.app.get('io');
  if (!io) {
    console.warn('[sendNotification] ⚠️ Socket.IO not available');
    return null;
  }

  // Normalize IDs
  const actorId = getId(actor);
  const recipientIdStr = getId(recipientId);

  if (!actorId || !recipientIdStr) {
    console.warn('[sendNotification] ⚠️ Invalid actor or recipient ID:', { actorId, recipientIdStr });
    return null;
  }

  // Don't notify the actor (person who triggered the event)
  if (recipientIdStr === actorId) {
    console.log('[sendNotification] ⚠️ Skipping self-notification:', { type, actorId });
    return null;
  }

  // Normalize metadata to ensure consistent schema
  const normalizedMetadata = {
    ...metadata,
    // Ensure recipientType is present for reply_added notifications
    recipientType: metadata.recipientType || null,
    // Ensure isReplyToReply flag is preserved for reply_added notifications
    isReplyToReply: metadata.isReplyToReply === true,
    // Ensure preview is truncated to 120 chars max
    preview: metadata.preview || metadata.commentContent || metadata.replyContent || metadata.messageContent || null,
  };
  if (normalizedMetadata.preview && normalizedMetadata.preview.length > 120) {
    normalizedMetadata.preview = normalizedMetadata.preview.substring(0, 120);
  }

  // Format message on server (preferred - client will use this if available)
  // Use local formatNotificationMessage function (no circular dependency)
  let serverMessage;
  try {
    serverMessage = formatNotificationMessage(type, actor.name || 'Unknown', normalizedMetadata);
    console.log(`[sendNotification] ✅ [${callId}] Formatted message (type: ${type}): "${serverMessage.substring(0, 60)}${serverMessage.length > 60 ? '...' : ''}"`);
  } catch (error) {
    console.error(`[sendNotification] ❌ [${callId}] ERROR formatting message:`, error.message);
    console.error(`[sendNotification] ❌ [${callId}] Stack:`, error.stack);
    console.error(`[sendNotification] ❌ [${callId}] Notification type:`, type);
    console.error(`[sendNotification] ❌ [${callId}] Actor:`, actor.name);
    console.error(`[sendNotification] ❌ [${callId}] Metadata keys:`, Object.keys(normalizedMetadata));
    serverMessage = 'New notification';
  }
  
  // Validate type is valid
  const validTypes = ['connection_request', 'connection_accepted', 'comment_added', 'reply_added', 'reaction_added', 'post_reaction_added', 'message', 'post_created'];
  if (!validTypes.includes(type)) {
    console.error(`[sendNotification] ❌ [${callId}] INVALID NOTIFICATION TYPE:`, type);
    console.error(`[sendNotification] ❌ [${callId}] Valid types are:`, validTypes.join(', '));
    console.error(`[sendNotification] ❌ [${callId}] This will result in "New notification" message!`);
  }
  
  // Warn if message is generic (indicates formatting issue)
  if (serverMessage === 'New notification' && validTypes.includes(type)) {
    console.warn(`[sendNotification] ⚠️ [${callId}] Got generic "New notification" message for valid type: ${type}`);
    console.warn(`[sendNotification] ⚠️ [${callId}] Check formatNotificationMessage switch case for this type`);
  }
  
  // Determine if notification should be marked as read
  const shouldAutoRead = type === 'connection_accepted' || read === true;

  // Prepare notification payload (consistent schema)
  // Include read status in payload so client can check before incrementing count
  const payload = {
    type,
    actor: {
      _id: actorId,
      name: actor.name || 'Unknown',
      profilePicture: actor.profilePicture
    },
    metadata: normalizedMetadata,
    message: serverMessage, // Include server-formatted message
    timestamp: new Date().toISOString(),
    read: shouldAutoRead // Include read status so client knows not to increment count
  };

  let savedNotification = null;

  // Save to database FIRST (if requested)
  if (saveToDb) {
    try {
      const Notification = require('../models/Notification');
      // Auto-mark connection_accepted notifications as read (they're informational only)
      // Also mark as read if explicitly requested (e.g., user is viewing the conversation)
      savedNotification = await Notification.create({
        recipient: recipientId,
        type,
        actor: actor._id,
        relatedId: normalizedMetadata.postId || normalizedMetadata.messageId || normalizedMetadata.commentId || normalizedMetadata.conversationId || null,
        relatedModel: normalizedMetadata.postId ? 'Post' : (normalizedMetadata.messageId ? 'Message' : (normalizedMetadata.commentId ? 'Comment' : (normalizedMetadata.conversationId ? 'Conversation' : null))),
        metadata: normalizedMetadata,
        read: shouldAutoRead,
        readAt: shouldAutoRead ? new Date() : undefined
      });
      console.log(`[sendNotification] ✅ Saved notification to database: ${savedNotification._id}`);
      console.log(`[sendNotification]   Notification read status: ${savedNotification.read}`);
      console.log(`[sendNotification]   Notification readAt: ${savedNotification.readAt || 'null'}`);
      if (shouldAutoRead) {
        const reason = type === 'connection_accepted' ? 'connection_accepted type' : 'explicit read flag';
        console.log(`[sendNotification] ✅ Auto-marked notification as read (${reason})`);
        console.log(`[sendNotification]   Read flag passed: ${read}, Should auto-read: ${shouldAutoRead}`);
      } else {
        console.log(`[sendNotification] ⚠️ Notification saved as UNREAD (read flag: ${read})`);
      }
    } catch (error) {
      console.error('[sendNotification] ❌ Failed to save to database:', error);
      // Continue to emit socket event even if DB save fails
    }
  }
  
  // Check if conversation is muted (for message notifications only)
  // Also check if mute has expired
  let isConversationMuted = false;
  if (type === 'message' && normalizedMetadata.conversationId) {
    try {
      const Conversation = require('../models/Conversation');
      const conversation = await Conversation.findById(normalizedMetadata.conversationId);
      if (conversation && Array.isArray(conversation.mutedBy)) {
        const isInMutedBy = conversation.mutedBy.some(
          mutedUserId => mutedUserId.toString() === recipientIdStr
        );
        
        if (isInMutedBy) {
          // Check if mute has expired
          if (conversation.mutedUntil && conversation.mutedUntil instanceof Map) {
            const mutedUntil = conversation.mutedUntil.get(recipientIdStr);
            if (mutedUntil === null || mutedUntil === undefined) {
              // null means muted until manually unmuted (permanent mute)
              isConversationMuted = true;
            } else if (mutedUntil instanceof Date) {
              // Check if expiration date is in the future
              isConversationMuted = mutedUntil > new Date();
              if (!isConversationMuted) {
                // Mute has expired, clean it up
                console.log(`[sendNotification] ⏰ [${callId}] Mute expired for user ${recipientIdStr}, cleaning up`);
                conversation.mutedBy = conversation.mutedBy.filter(
                  id => id.toString() !== recipientIdStr
                );
                conversation.mutedUntil.delete(recipientIdStr);
                await conversation.save().catch(err => {
                  console.error(`[sendNotification] ⚠️ [${callId}] Failed to clean up expired mute:`, err);
                });
              }
            } else {
              // Invalid mutedUntil value, treat as not muted
              isConversationMuted = false;
            }
          } else {
            // No mutedUntil map, fall back to mutedBy check (legacy behavior)
            isConversationMuted = isInMutedBy;
          }
          
          if (isConversationMuted) {
            console.log(`[sendNotification] 🔇 [${callId}] Conversation is muted for recipient - suppressing alerts`);
          }
        }
      }
    } catch (muteCheckError) {
      console.error(`[sendNotification] ⚠️ [${callId}] Error checking mute status:`, muteCheckError);
      // Continue with notification if mute check fails (fail open)
    }
  }

  // Add read flag to payload so client knows not to show toaster if user is viewing conversation
  // Update payload metadata to include shouldSkipToaster flag and notification ID if available
  // Also add isMuted flag to suppress alerts on client side
  payload.metadata = {
    ...normalizedMetadata,
    ...(read === true && type === 'message' ? { shouldSkipToaster: true } : {}),
    ...(isConversationMuted && type === 'message' ? { isMuted: true } : {}),
    ...(savedNotification?._id ? { notificationId: savedNotification._id.toString() } : {})
  };

  // Emit socket event to recipient's personal room
  // For muted conversations, still emit but with isMuted flag so client can suppress alerts
  // This allows unread counts and inbox updates to still work
  const recipientRoom = `user:${recipientIdStr}`;
  
  if (isConversationMuted && type === 'message') {
    // For muted conversations, emit with isMuted flag but don't trigger alerts
    // Client will check this flag and suppress toasts/sounds while still updating counts
    console.log(`[sendNotification] 🔇 [${callId}] Emitting muted notification (alerts suppressed): ${type} to room ${recipientRoom}`);
  } else {
    console.log(`[sendNotification] ✅ [${callId}] Emitted ${type} to room ${recipientRoom}`);
  }
  
  io.to(recipientRoom).emit('notification', payload);
  console.log(`[sendNotification]   [${callId}] Actor: ${actor.name} (${actorId})`);
  console.log(`[sendNotification]   [${callId}] Recipient: ${recipientIdStr}`);
  console.log(`[sendNotification]   [${callId}] Message: "${serverMessage.substring(0, 80)}${serverMessage.length > 80 ? '...' : ''}"`);
  console.log(`[sendNotification]   [${callId}] Read status in payload: ${payload.read}`);
  console.log(`[sendNotification]   [${callId}] Should auto-read: ${shouldAutoRead}`);
  console.log(`[sendNotification]   [${callId}] Is muted: ${isConversationMuted}`);
  console.log(`[sendNotification]   [${callId}] Metadata keys:`, Object.keys(normalizedMetadata));
  
  // If notification was saved as read, also emit a refresh event to update unread count immediately
  // This ensures the bell icon count doesn't increment for read notifications
  if (shouldAutoRead && savedNotification) {
    console.log(`[sendNotification] ✅ [${callId}] Notification marked as read - emitting refresh event to update count`);
    io.to(recipientRoom).emit('notifications:refresh-count');
  }

  return savedNotification;
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use sendNotification instead
 */
async function emitNotification(req, options) {
  console.warn('[emitNotification] ⚠️ Using deprecated emitNotification, consider using sendNotification');
  return sendNotification(req, options);
}

/**
 * Helper functions for specific notification types
 * These wrappers call sendNotification with normalized metadata
 */
const NotificationEmitter = {
  // Connection request
  connectionRequest: async (req, recipientId, actor) => {
    return sendNotification(req, {
      type: 'connection_request',
      recipientId,
      actor,
      metadata: { userId: getId(actor) }
    });
  },

  // Connection accepted
  connectionAccepted: async (req, recipientId, actor) => {
    return sendNotification(req, {
      type: 'connection_accepted',
      recipientId,
      actor,
      metadata: { userId: getId(actor) }
    });
  },

  // Comment added to post
  commentAdded: async (req, recipientId, actor, postId, commentId, commentContent, postOwnerName) => {
    return sendNotification(req, {
      type: 'comment_added',
      recipientId,
      actor,
      metadata: {
        postId: String(postId),
        commentId: String(commentId),
        preview: commentContent?.substring(0, 120),
        postOwnerName: postOwnerName || 'Unknown'
      }
    });
  },

  // Reaction (upvote) added to post
  postReactionAdded: async (req, recipientId, actor, postId) => {
    return sendNotification(req, {
      type: 'post_reaction_added',
      recipientId,
      actor,
      metadata: {
        postId: String(postId)
      }
    });
  },

  // Reaction (upvote) added to comment or reply
  reactionAdded: async (req, recipientId, actor, postId, commentId, postOwnerName, replyId = null) => {
    return sendNotification(req, {
      type: 'reaction_added',
      recipientId,
      actor,
      metadata: {
        postId: String(postId),
        commentId: String(commentId),
        replyId: replyId ? String(replyId) : null,
        postOwnerName: postOwnerName || 'Unknown'
      }
    });
  },

  // Reply added to comment
  replyAdded: async (req, recipientId, actor, postId, commentId, replyId, replyContent, postOwnerName, recipientType = null, isReplyToReply = false, replyToUserId = null) => {
    return sendNotification(req, {
      type: 'reply_added',
      recipientId,
      actor,
      metadata: {
        postId: String(postId),
        commentId: String(commentId),
        replyId: String(replyId),
        preview: replyContent?.substring(0, 120),
        postOwnerName: postOwnerName || 'Unknown',
        recipientType: recipientType || null,
        isReplyToReply: isReplyToReply || false,
        replyToUserId: replyToUserId ? String(replyToUserId) : null
      }
    });
  },

  // Message (already handled separately, but included for consistency)
  message: async (req, recipientId, actor, conversationId, messageId, messageContent) => {
    return sendNotification(req, {
      type: 'message',
      recipientId,
      actor,
      metadata: {
        conversationId: String(conversationId),
        messageId: String(messageId),
        preview: messageContent?.substring(0, 120)
      }
    });
  }
};

module.exports = { sendNotification, emitNotification, NotificationEmitter, getId, formatNotificationMessage };

