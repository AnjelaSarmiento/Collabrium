# Comment & Reply Notification System - Complete Guide

## Overview

This document explains the complete logic for how comment and reply notifications work in the system, including who receives them, what messages are shown, where they appear, and how highlighting works.

---

## Notification Flow Architecture

### 1. **Backend Trigger** (`routes/posts.js`)
When a user comments or replies, the backend:
- Saves the comment/reply to database
- Determines notification recipients based on ownership
- Emits notifications to specific user rooms via Socket.IO
- Emits UI refresh events to post room (for real-time updates)

### 2. **Socket.IO Distribution** (`utils/notifications.js`)
- Notifications are sent to personal rooms: `user:${recipientId}`
- Each user automatically joins their personal room on connection
- UI refresh events are sent to post room: `post:${postId}` (does NOT trigger notifications)

### 3. **Frontend Reception** (`client/src/components/NotificationBridge.tsx`)
- Listens for `notification` events on Socket.IO
- Formats messages based on notification type and recipient type
- Shows toast notifications (if preferences allow)
- Triggers dropdown/inbox refresh

### 4. **Display Locations**
- **Realtime Popup (Toaster)**: `ToastContainer.tsx` - Shows immediately when notification arrives
- **Notification Dropdown**: `NotificationsDropdown.tsx` - Shows in navbar bell icon
- **Notification Inbox**: `Notifications.tsx` - Full notification management page

---

## Complete Notification Matrix

| Action | Receiver | Condition | Message Shown | Where It Appears | Unread Count | Highlighting on Click |
|--------|----------|-----------|---------------|------------------|--------------|----------------------|
| **User A comments on User B's post** | Post Owner (User B) | `postAuthorId !== currentUserId` | `"{ActorName} commented on your post"` | Toaster + Dropdown + Inbox | ✅ Increases | Highlights comment with `?highlight={commentId}` |
| **User A replies to User B's comment** | Comment Owner (User B) | `commentAuthorId !== currentUserId` | `"{ActorName} replied to your comment"`<br/>or<br/>`"{ActorName} replied to your comment on {PostOwnerName}'s post"` | Toaster + Dropdown + Inbox | ✅ Increases | Highlights comment + reply with `?highlight={commentId}&reply={replyId}` |
| **User A replies to User B's comment** | Post Owner (if different from comment owner) | `postAuthorId !== currentUserId && postAuthorId !== commentAuthorId` | `"{ActorName} replied to a comment on your post"` | Toaster + Dropdown + Inbox | ✅ Increases | Highlights comment + reply with `?highlight={commentId}&reply={replyId}` |
| **User A replies to User B's reply** | Reply Owner (User B) | `isReplyToReply && replyToUserId !== currentUserId && replyToUserId !== commentAuthorId && replyToUserId !== postAuthorId` | `"{ActorName} replied to your reply"`<br/>or<br/>`"{ActorName} replied to your reply on {PostOwnerName}'s post"` | Toaster + Dropdown + Inbox | ✅ Increases | Highlights comment + reply with `?highlight={commentId}&reply={replyId}` |
| **User A replies to User B's reply** | Comment Owner (if different from reply owner) | `commentAuthorId !== currentUserId && commentAuthorId !== replyToUserId` | `"{ActorName} replied to your comment on {PostOwnerName}'s post"` | Toaster + Dropdown + Inbox | ✅ Increases | Highlights comment + reply with `?highlight={commentId}&reply={replyId}` |
| **User A replies to User B's reply** | Post Owner (if different from reply owner and comment owner) | `postAuthorId !== currentUserId && postAuthorId !== commentAuthorId && postAuthorId !== replyToUserId` | `"{ActorName} replied to a comment on your post"` | Toaster + Dropdown + Inbox | ✅ Increases | Highlights comment + reply with `?highlight={commentId}&reply={replyId}` |

---

## Detailed Logic Breakdown

### Comment Added (`POST /api/posts/:id/comment`)

**Trigger**: User submits a comment on a post

**Notification Logic**:
```javascript
if (postAuthorId !== currentUserId) {
  // Notify post owner
  NotificationEmitter.commentAdded(
    req,
    postAuthorId,  // Recipient
    actor,         // User who commented
    postId,
    commentId,
    content,
    postOwnerName
  );
}
```

**Recipients**:
- ✅ Post owner (if commenter is not the post owner)
- ❌ No one else

**Message Format**:
- `"{ActorName} commented on your post"`

**UI Refresh**:
- Emits `post:activity` to `post:${postId}` room
- All users viewing the post get real-time UI update (no notification)

---

### Reply Added (`POST /api/posts/:id/comment/:commentId/reply`)

**Trigger**: User submits a reply to a comment or another reply

**Notification Logic**:

#### 1. Comment Owner Notification
```javascript
if (commentAuthorId && commentAuthorId !== currentUserId) {
  emitNotification({
    type: 'reply_added',
    recipientId: commentAuthorId,
    metadata: {
      recipientType: 'comment_owner',
      postOwnerName: postOwnerName,
      // ... other metadata
    }
  });
}
```

**Recipients**:
- ✅ Comment owner (if replier is not the comment owner)

**Message Format**:
- If post owner name is available: `"{ActorName} replied to your comment on {PostOwnerName}'s post"`
- Otherwise: `"{ActorName} replied to your comment"`

#### 2. Post Owner Notification
```javascript
if (postAuthorId && postAuthorId !== currentUserId && postAuthorId !== commentAuthorId) {
  emitNotification({
    type: 'reply_added',
    recipientId: postAuthorId,
    metadata: {
      recipientType: 'post_owner',
      // ... other metadata
    }
  });
}
```

**Recipients**:
- ✅ Post owner (if replier is not post owner AND post owner is not comment owner)

**Message Format**:
- `"{ActorName} replied to a comment on your post"`

#### 3. Reply Owner Notification (Reply-to-Reply)
```javascript
if (isReplyToReply && replyToUserId && 
    replyToUserId !== currentUserId && 
    replyToUserId !== commentAuthorId && 
    replyToUserId !== postAuthorId) {
  emitNotification({
    type: 'reply_added',
    recipientId: replyToUserId,
    metadata: {
      recipientType: 'reply_owner',
      postOwnerName: postOwnerName,
      // ... other metadata
    }
  });
}
```

**Recipients**:
- ✅ Reply owner (if it's a reply-to-reply AND reply owner is different from all other parties)

**Message Format**:
- If post owner name is available: `"{ActorName} replied to your reply on {PostOwnerName}'s post"`
- Otherwise: `"{ActorName} replied to your reply"`

**UI Refresh**:
- Emits `post:activity` to `post:${postId}` room
- All users viewing the post get real-time UI update (no notification)

---

## Notification Display Locations

### 1. Realtime Popup (Toaster)
- **Component**: `ToastContainer.tsx`
- **Trigger**: Socket.IO `notification` event received
- **Conditions**:
  - User preferences allow in-app alerts
  - Do Not Disturb is not active
  - Notification type is enabled in preferences
  - Actor is not the current user (self-notifications filtered)
- **Duration**: Auto-dismisses after timeout (configurable)
- **Actions**: Click to navigate to post/comment

### 2. Notification Dropdown
- **Component**: `NotificationsDropdown.tsx`
- **Trigger**: 
  - Socket.IO `notification` event (refetches list)
  - Manual refresh via `notifications:refresh-count` event
- **Display**: Shows last 10 unread notifications
- **Updates**: Real-time via socket events
- **Actions**: Click to navigate to post/comment

### 3. Notification Inbox
- **Component**: `Notifications.tsx`
- **Trigger**: 
  - Socket.IO `notification` event (refetches list)
  - Manual refresh via `notifications:refresh-count` event
  - Page navigation/filter changes
- **Display**: Paginated list of all notifications
- **Features**: 
  - Filter by type
  - Mark as read/unread
  - Delete notifications
  - Bulk operations
- **Actions**: Click to navigate to post/comment

---

## Unread Count Behavior

### When Count Increases
- ✅ New notification is saved to database (`saveToDb: true` by default)
- ✅ Notification is marked as `read: false` (except `connection_accepted` which is auto-read)
- ✅ Bell icon count increments in real-time

### When Count Decreases
- ✅ User marks notification as read
- ✅ User deletes notification
- ✅ User clicks notification (auto-marks as read)

### Count Updates
- **Real-time**: Via Socket.IO events
- **On navigation**: Refetches count when navigating to notification pages
- **Manual refresh**: Via `notifications:refresh-count` window event

---

## Highlighting Behavior

### How It Works
When a user clicks a notification, the system:
1. Navigates to the post detail page with URL parameters
2. PostDetail component reads URL parameters
3. Highlights the relevant element (post, comment, or reply)
4. Clears URL parameters after highlighting animation

### Highlight Parameters

| Notification Type | URL Parameters | What Gets Highlighted |
|------------------|---------------|----------------------|
| `comment_added` | `?highlight={commentId}` | The comment that was added |
| `reply_added` | `?highlight={commentId}&reply={replyId}` | The comment (parent) and the specific reply |
| `post_reaction_added` | `?highlight=post` | The entire post |
| `reaction_added` (comment) | `?highlight={commentId}` | The comment that was upvoted |
| `reaction_added` (reply) | `?highlight={commentId}&reply={replyId}` | The comment and the specific reply |

### Highlight Implementation
- **Function**: `highlightPost(postId, commentId?, replyId?)`
- **Visual Effect**: Adds temporary highlight animation (yellow/blue flash)
- **Duration**: ~2.5 seconds
- **Retry Logic**: Retries up to 5 times if element not found (waits for comments to render)

---

## Edge Cases & Special Logic

### Self-Notifications
- ❌ Users never receive notifications for their own actions
- Exception: `connection_accepted` (informational, actor is the person who accepted)

### Duplicate Prevention
- Backend checks: `recipientId !== actor._id` before sending
- Frontend checks: `actorId !== userId` before showing toast

### Multiple Recipients
When replying to a comment:
- Comment owner gets: `"replied to your comment"`
- Post owner gets: `"replied to a comment on your post"`
- Both receive separate notifications (if they're different people)

When replying to a reply:
- Reply owner gets: `"replied to your reply"`
- Comment owner gets: `"replied to your comment"` (if different from reply owner)
- Post owner gets: `"replied to a comment on your post"` (if different from both)

### Notification Grouping
- Backend groups multiple notifications from same user on same entity
- Example: "left 3 comments on your post" instead of 3 separate notifications
- Time window: Groups notifications in the same fetch batch

---

## Code References

### Backend
- **Comment Creation**: `routes/posts.js:792-895`
- **Reply Creation**: `routes/posts.js:897-1091`
- **Notification Emitter**: `utils/notifications.js:24-92`
- **Notification Helpers**: `utils/notifications.js:118-176`

### Frontend
- **Notification Bridge**: `client/src/components/NotificationBridge.tsx:273-395`
- **Message Formatting**: `client/src/components/NotificationBridge.tsx:43-121`
- **Toast Container**: `client/src/components/ToastContainer.tsx`
- **Notification Dropdown**: `client/src/components/NotificationsDropdown.tsx`
- **Notification Inbox**: `client/src/pages/Notifications.tsx`
- **Highlighting**: `client/src/pages/PostDetail.tsx:228-323`

---

## Testing Scenarios

### Scenario 1: Simple Comment
1. User A comments on User B's post
2. ✅ User B receives: "User A commented on your post"
3. ✅ Notification appears in toaster, dropdown, and inbox
4. ✅ Clicking highlights the comment

### Scenario 2: Reply to Comment
1. User A replies to User B's comment on User C's post
2. ✅ User B receives: "User A replied to your comment on User C's post"
3. ✅ User C receives: "User A replied to a comment on your post"
4. ✅ Both notifications appear in all locations
5. ✅ Clicking highlights comment and reply

### Scenario 3: Reply to Reply
1. User A replies to User B's reply (which was on User C's comment on User D's post)
2. ✅ User B receives: "User A replied to your reply on User D's post"
3. ✅ User C receives: "User A replied to your comment on User D's post" (if different from B)
4. ✅ User D receives: "User A replied to a comment on your post" (if different from B and C)
5. ✅ All relevant notifications appear
6. ✅ Clicking highlights comment and reply

### Scenario 4: Self-Actions
1. User A comments on their own post
2. ❌ No notification sent (self-action)
3. ✅ UI still refreshes for viewers (via `post:activity`)

---

## Summary

The notification system ensures:
- ✅ **Correct Recipients**: Only relevant users receive notifications
- ✅ **Contextual Messages**: Messages vary based on recipient role
- ✅ **Multiple Channels**: Notifications appear in toaster, dropdown, and inbox
- ✅ **Real-time Updates**: Instant delivery via Socket.IO
- ✅ **Smart Highlighting**: Clicking notifications highlights the relevant content
- ✅ **Unread Tracking**: Count increments and decrements correctly
- ✅ **No Duplicates**: Self-notifications and duplicates are prevented

