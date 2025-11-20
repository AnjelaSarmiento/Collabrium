const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { formatNotificationMessage } = require('../utils/notifications');

const router = express.Router();

// Helper: Group repeated actions from the same user
function groupNotifications(notifications) {
  const grouped = [];
  const groups = new Map(); // key: "actorId_type_relatedId", value: array of notifications
  
  // Group notifications by actor + type + related entity
  // Only group notifications that are groupable (comments, replies, reactions)
  const groupableTypes = ['comment_added', 'reply_added', 'reaction_added', 'post_reaction_added'];
  
  if (!Array.isArray(notifications)) {
    console.error('[Notifications] groupNotifications: notifications is not an array:', notifications);
    return [];
  }
  
  notifications.forEach(n => {
    try {
      if (!n || !n._id) {
        console.warn('[Notifications] Skipping invalid notification:', n);
        return;
      }
      
      const actorId = n.actor?._id?.toString() || 'unknown';
      const type = n.type || 'unknown';
      const relatedId = n.metadata?.postId || n.metadata?.commentId || n.metadata?.conversationId || 'none';
      
      // Only group certain types
      if (groupableTypes.includes(type)) {
        const key = `${actorId}_${type}_${relatedId}`;
        
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(n);
      } else {
        // Non-groupable types go directly to grouped array
        const formatted = {
          ...n,
          message: formatNotificationMessage(type, n.actor?.name || 'Someone', n.metadata || {})
        };
        grouped.push(formatted);
      }
    } catch (groupErr) {
      console.error('[Notifications] Error grouping notification:', groupErr, n);
      // Add notification as-is if grouping fails
      const formatted = {
        ...n,
        message: formatNotificationMessage(n.type || 'unknown', n.actor?.name || 'Someone', n.metadata || {})
      };
      grouped.push(formatted);
    }
  });
  
  // Process groups and create grouped notifications
  groups.forEach((group, key) => {
    try {
      if (!Array.isArray(group) || group.length === 0) {
        console.warn('[Notifications] Invalid group:', key, group);
        return;
      }
      
      if (group.length === 1) {
        // Single notification, format normally
        const n = group[0];
        if (!n || !n._id) {
          console.warn('[Notifications] Invalid notification in group:', n);
          return;
        }
        const formatted = {
          ...n,
          message: formatNotificationMessage(n.type || 'unknown', n.actor?.name || 'Someone', n.metadata || {})
        };
        grouped.push(formatted);
      } else {
        // Multiple notifications from same user/type/entity - combine them
        const first = group[0];
        if (!first || !first._id) {
          console.warn('[Notifications] Invalid first notification in group:', first);
          return;
        }
        const actorName = first.actor?.name || 'Someone';
        const type = first.type || 'unknown';
        const metadata = first.metadata || {};
        
        // Create grouped message with actor name
        let groupedMessage = '';
        const count = group.length;
        
        switch (type) {
          case 'comment_added':
            groupedMessage = `${actorName} left ${count} comment${count > 1 ? 's' : ''} on your post`;
            break;
          case 'reply_added':
            groupedMessage = `${actorName} left ${count} repl${count > 1 ? 'ies' : 'y'} on your ${metadata.recipientType === 'post_owner' ? 'post' : 'comment'}`;
            break;
          case 'reaction_added':
          case 'post_reaction_added':
            groupedMessage = `${actorName} upvoted your ${type === 'post_reaction_added' ? 'post' : 'comment'} ${count > 1 ? `${count} times` : ''}`;
            break;
          default:
            // For other types, don't group - use first notification's message
            const formatted = {
              ...first,
              message: formatNotificationMessage(type, actorName, metadata)
            };
            grouped.push(formatted);
            return;
        }
        
        // Use the most recent notification as the base
        const mostRecent = group
          .filter(n => n && n.createdAt)
          .sort((a, b) => {
            try {
              const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
              const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
              return dateB - dateA;
            } catch (sortErr) {
              return 0;
            }
          })[0];
        
        if (!mostRecent) {
          console.warn('[Notifications] No valid recent notification in group');
          return;
        }
        
        // Create grouped notification
        grouped.push({
          ...mostRecent,
          message: groupedMessage,
          metadata: {
            ...metadata,
            groupedCount: count,
            groupedIds: group.filter(n => n && n._id).map(n => String(n._id))
          }
        });
      }
    } catch (processErr) {
      console.error('[Notifications] Error processing group:', processErr, key, group);
      // Add first notification as-is if processing fails
      if (group && group.length > 0 && group[0]) {
        const n = group[0];
        const formatted = {
          ...n,
          message: formatNotificationMessage(n.type || 'unknown', n.actor?.name || 'Someone', n.metadata || {})
        };
        grouped.push(formatted);
      }
    }
  });
  
  // Sort by most recent
  return grouped.sort((a, b) => {
    try {
      const dateA = a?.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b?.createdAt ? new Date(b.createdAt) : new Date(0);
      return dateB - dateA;
    } catch (sortErr) {
      console.error('[Notifications] Error sorting grouped notifications:', sortErr);
      return 0;
    }
  }).filter(n => n && n._id); // Filter out any invalid notifications
}

// GET /api/notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 100);
    const type = req.query.type;

    const query = { recipient: req.user._id };
    if (type) {
      query.type = type;
    }

    // Fetch more notifications to allow for grouping
    const fetchLimit = Math.min(pageSize * 3, 100);
    let notifications = [];
    try {
      notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .populate({
          path: 'actor',
          select: 'name profilePicture',
          options: { strictPopulate: false } // Don't throw if actor doesn't exist
        })
        .lean(); // Use lean() to get plain objects, faster and safer
    } catch (queryErr) {
      console.error('[Notifications] Error fetching notifications:', queryErr);
      console.error('[Notifications] Query was:', query);
      // Return empty array on query error
      notifications = [];
    }

    // Group notifications
    let grouped = [];
    try {
      grouped = groupNotifications(notifications);
    } catch (groupErr) {
      console.error('[Notifications] Error grouping notifications:', groupErr);
      // If grouping fails, return notifications as-is
      grouped = notifications.map(n => ({
        ...n,
        message: formatNotificationMessage(n.type || 'unknown', n.actor?.name || 'Someone', n.metadata || {})
      }));
    }
    
    // Paginate grouped results
    const startIndex = (page - 1) * pageSize;
    let paginated = [];
    try {
      paginated = grouped.slice(startIndex, startIndex + pageSize);
    } catch (sliceErr) {
      console.error('[Notifications] Error paginating:', sliceErr);
      paginated = [];
    }
    
    const items = paginated.map(n => {
      try {
        // Safely handle notification properties
        const actor = n.actor && n.actor._id ? {
          _id: String(n.actor._id),
          name: n.actor.name || 'Someone',
          profilePicture: n.actor.profilePicture || undefined
        } : undefined;
        
        return {
          _id: n._id ? String(n._id) : '',
          type: n.type || 'unknown',
          actor: actor,
          message: n.message || formatNotificationMessage(n.type || 'unknown', actor?.name || 'Someone', n.metadata || {}),
          metadata: n.metadata || {},
          createdAt: n.createdAt ? (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt)) : new Date(),
          read: !!n.read,
        };
      } catch (itemErr) {
        console.error('[Notifications] Error mapping notification item:', itemErr, n);
        // Return a safe fallback item
        return {
          _id: n._id ? String(n._id) : 'error',
          type: 'unknown',
          actor: undefined,
          message: 'Error loading notification',
          metadata: {},
          createdAt: new Date(),
          read: false,
        };
      }
    });

    // Calculate total (approximate, since grouping changes count)
    const total = grouped.length;

    // Ensure items is an array
    const safeItems = Array.isArray(items) ? items : [];

    res.json({ success: true, notifications: safeItems, pagination: { total, page, pageSize } });
  } catch (err) {
    console.error('[Notifications] List error:', err);
    console.error('[Notifications] Error stack:', err.stack);
    console.error('[Notifications] Error details:', {
      message: err.message,
      name: err.name,
      query: req.query,
      userId: req.user?._id
    });
    res.status(500).json({ success: false, message: 'Server error', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// GET /api/notifications/unread-count (static routes must come before dynamic :id routes)
// Exclude message notifications - they should only appear in Messages dropdown
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    // Count unread notifications excluding message type
    // Message notifications should only appear in Messages dropdown, not bell notifications
    const count = await Notification.countDocuments({ 
      recipient: req.user._id, 
      read: false,
      type: { $ne: 'message' } // Exclude message notifications
    });
    console.log('[Notifications] Unread count requested (excluding messages):', { userId: req.user._id, count });
    res.json({ success: true, count });
  } catch (err) {
    console.error('[Notifications] Unread count error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/notifications/read-all (static routes must come before dynamic :id routes)
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true, readAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] Mark all read error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/notifications/:id/read (more specific route, comes before generic :id)
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { read } = req.body || {};
    
    const notif = await Notification.findOne({ _id: id, recipient: req.user._id });
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    
    // Check if this notification is part of a groupable type
    // Groupable types: comment_added, reply_added, reaction_added, post_reaction_added
    const groupableTypes = ['comment_added', 'reply_added', 'reaction_added', 'post_reaction_added'];
    const isGroupable = groupableTypes.includes(notif.type);
    
    if (isGroupable && read) {
      // For groupable notifications, mark all notifications in the same group as read
      // Group key: same actor + same type + same relatedId
      const actorId = notif.actor?.toString() || notif.actor;
      const type = notif.type;
      const postId = notif.metadata?.postId;
      const commentId = notif.metadata?.commentId;
      const conversationId = notif.metadata?.conversationId;
      
      // Build query to find all notifications in the same group
      // Match the same grouping logic used in groupNotifications function
      const groupQuery = {
        recipient: req.user._id,
        actor: actorId,
        type: type,
        read: false // Only mark unread ones as read
      };
      
      // Add relatedId filter - must match the same related entity
      // The grouping logic uses: metadata.postId || metadata.commentId || metadata.conversationId
      // So we need to match notifications that have the same relatedId in any of these fields
      if (postId) {
        groupQuery['metadata.postId'] = postId;
      } else if (commentId) {
        groupQuery['metadata.commentId'] = commentId;
      } else if (conversationId) {
        groupQuery['metadata.conversationId'] = conversationId;
      }
      // If none exist, we'll match notifications with no relatedId in any of these fields
      
      // Mark all notifications in the group as read
      const updateResult = await Notification.updateMany(
        groupQuery,
        { 
          read: true, 
          readAt: new Date() 
        }
      );
      
      console.log('[Notifications] Marked grouped notification as read:', {
        notificationId: id,
        actorId,
        type,
        postId,
        commentId,
        conversationId,
        markedCount: updateResult.modifiedCount
      });
      
      res.json({ success: true, markedCount: updateResult.modifiedCount });
    } else {
      // For non-groupable notifications or when marking as unread, mark just this one
      notif.read = !!read;
      notif.readAt = read ? new Date() : undefined;
      await notif.save();
      
      console.log('[Notifications] Marked notification as read:', {
        notificationId: id,
        read,
        isGroupable: false
      });
      
      res.json({ success: true, markedCount: 1 });
    }
  } catch (err) {
    console.error('[Notifications] Mark read error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/notifications/:id (dynamic route, comes after static routes)
router.delete('/:id', authenticateToken, async (req, res) => {
  console.log('[Notifications] DELETE route hit:', req.method, req.path, req.params);
  try {
    const { id } = req.params;
    
    // Validate ID exists
    if (!id) {
      return res.status(400).json({ success: false, message: 'Notification ID is required' });
    }
    
    // Check if notification exists and belongs to user
    const notif = await Notification.findOne({ _id: id, recipient: req.user._id });
    if (!notif) {
      console.log('[Notifications] Delete: Notification not found', { id, userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Delete the notification
    const result = await Notification.deleteOne({ _id: id, recipient: req.user._id });
    
    if (result.deletedCount === 0) {
      console.log('[Notifications] Delete: Delete operation returned 0 deletedCount', { id, userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    
    console.log('[Notifications] Delete: Successfully deleted notification', { id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] Delete error:', err);
    console.error('[Notifications] Delete error details:', {
      id: req.params.id,
      userId: req.user?._id,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Export router as default
// formatNotificationMessage is now in utils/notifications.js to avoid circular dependencies
module.exports = router;


