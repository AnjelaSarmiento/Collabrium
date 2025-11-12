# Notification Grouping and Count Behavior

## Overview

This document explains how grouped notifications are stored, displayed, and counted in the system.

## Database Storage

**Grouped notifications are NOT stored as single entries in the database.**

- Each notification action (comment, reply, reaction, etc.) is stored as a **separate individual notification document** in MongoDB
- Example: If "Anjela Sofia G. upvoted your comment 3 times", there are **3 separate notification documents** in the database
- Each document has its own `_id`, `read` status, `createdAt` timestamp, etc.

## Grouping Logic

Grouping happens **on-the-fly** when fetching notifications via the `GET /api/notifications` endpoint:

1. **Fetch Phase**: The backend fetches individual notification documents from the database
2. **Grouping Phase**: The `groupNotifications()` function groups notifications by:
   - Same `actor` (user who performed the action)
   - Same `type` (notification type: comment_added, reply_added, etc.)
   - Same `relatedId` (postId, commentId, or conversationId from metadata)
3. **Display Phase**: Multiple notifications from the same group are combined into a single display item with a message like "Anjela Sofia G. upvoted your comment 3 times"

### Groupable Types

Only these notification types are grouped:
- `comment_added`
- `reply_added`
- `reaction_added`
- `post_reaction_added`

Other types (messages, connection requests, etc.) are displayed individually.

## Count Behavior

### Bell Icon Count (Unread Count)

**The bell icon shows the number of individual unread notification documents, not grouped notifications.**

- **Endpoint**: `GET /api/notifications/unread-count`
- **Query**: `Notification.countDocuments({ recipient: req.user._id, read: false })`
- **Result**: Counts individual notification documents

**Example**:
- If "Anjela Sofia G. upvoted your comment 3 times" represents 3 unread notifications
- The bell icon will show **3**, not 1
- This is the correct behavior from a UX perspective - the user has 3 unread actions

### Notification List Count

The notification list (dropdown/inbox) shows:
- **Grouped notifications** in the UI (e.g., "Anjela Sofia G. upvoted your comment 3 times")
- **Total count** from `pagination.total` which is the number of grouped display items

**Example**:
- If you have 3 individual upvote notifications that are grouped into 1 display item
- The list shows: "1 notification" (1 grouped item)
- The bell icon shows: "3" (3 individual unread documents)

## Mark as Read Behavior

When a grouped notification is marked as read:

1. **Backend Logic**: The `PUT /api/notifications/:id/read` endpoint detects groupable notifications
2. **Group Matching**: It finds all notifications in the same group (same actor, type, relatedId)
3. **Bulk Update**: It marks **all unread notifications in that group** as read in one operation
4. **Count Update**: The bell icon count decreases by the actual number of notifications marked (e.g., 3)

**Example**:
- User clicks "Anjela Sofia G. upvoted your comment 3 times"
- Backend marks all 3 individual notification documents as read
- Bell icon count decreases by 3 (not 1)

## Expected Behavior Summary

✅ **Correct Behavior**:
- Bell icon shows individual unread count (3 for "3 times" notification)
- Notification list shows grouped display items (1 for "3 times" notification)
- Marking grouped notification as read decreases bell count by actual number (3)
- Grouping is done on-the-fly, not stored in database

❌ **Incorrect Behavior** (should not happen):
- Bell icon showing 1 for a "3 times" grouped notification
- Marking grouped notification as read only decreasing count by 1

## Code References

- **Grouping Logic**: `routes/notifications.js` - `groupNotifications()` function (lines 99-260)
- **Unread Count**: `routes/notifications.js` - `GET /unread-count` endpoint (lines 370-380)
- **Mark as Read**: `routes/notifications.js` - `PUT /:id/read` endpoint (lines 393-477)
- **Frontend Count**: `client/src/components/Navbar.tsx` - `unreadCount` state and badge display

