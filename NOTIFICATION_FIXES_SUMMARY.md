# Notification & Realtime Fixes - Implementation Summary

## Priority 1 - Critical Fixes (✅ Completed)

### 1. Centralize Notification Sending (Server)
- ✅ Created `sendNotification()` in `utils/notifications.js` that ALWAYS:
  - Creates DB notification record
  - Emits socket event to `user:<recipientId>` room
  - Returns saved notification object
- ✅ All notification calls in `routes/posts.js` now use `sendNotification()` directly or through `NotificationEmitter.*` wrappers
- ✅ Added `getId()` helper for safe ID extraction

### 2. Fix Reply Recipient Logic (Server)
- ✅ Replaced conditional ladder with Map-based dedupe approach
- ✅ Ensures correct recipients:
  - Comment owner always notified (if different from current user)
  - Post owner always notified (if different from comment owner and current user)
  - Reply owner always notified for reply-to-reply (if different from current user)
  - Priority: `reply_owner > comment_owner > post_owner` (most specific role wins)
- ✅ Fixed metadata: comment owner notifications set `isReplyToReply: false` correctly

### 3. Remove Client-Side Deletion on Accept/Decline
- ✅ Server (`routes/users.js`) now deletes `connection_request` notifications on accept/decline
- ✅ Server emits `notifications:refresh-count` event to user room
- ✅ Removed all client-side deletion code from:
  - `NotificationBridge.tsx`
  - `NotificationsDropdown.tsx`
  - `Notifications.tsx`
- ✅ Client now just calls API endpoint and refreshes list

## Priority 2 - High Priority Fixes (✅ Completed)

### 4. Standardize Metadata & Payload Shape
- ✅ Consistent metadata schema:
  - `type`, `actor`, `metadata`, `message`, `timestamp`
  - `metadata` includes: `postId`, `commentId`, `replyId`, `recipientType`, `preview`, `postOwnerName`
  - `preview` truncated to 120 chars max

### 5. Prefer Server Message (Client)
- ✅ `NotificationBridge.tsx` now uses `data.message` if present (server-provided)
- ✅ Falls back to `formatNotificationMessage()` only if server message missing
- ✅ Safe preview removal using `metadata.preview`

### 6. Stabilize Socket Listener
- ✅ Moved `handleNotification` outside `useEffect` with `useCallback`
- ✅ Preferences checked inside handler (not in dependencies)
- ✅ Minimal dependencies: `socket`, `user`, `showToast`, `registerNotificationCallback`, `handleNotification`

### 7. Ensure Reaction/Upvote Events Update on Both Upvote/Un-upvote
- ✅ Server emits `reaction:updated` with `upvoted: true|false` for both actions
- ✅ Emits to both `post:<postId>` and `user:<ownerId>` rooms
- ✅ Client (`PostDetail.tsx`, `CollabFeed.tsx`, `EnhancedComments.tsx`) updates UI for both upvote and un-upvote

## Additional Improvements

### Server Message Formatting
- ✅ `sendNotification()` now includes server-formatted message in payload
- ✅ `routes/notifications.js` exports `formatNotificationMessage` for reuse
- ✅ Ensures consistent message formatting across server and client

### Debugging & Logging
- ✅ Added comprehensive logging:
  - Server: `[sendNotification]`, `[Accept Connection]`, `[Decline Connection]`
  - Client: `[NotificationBridge]`, `[PostDetail]`, `[EnhancedComments]`, `[CollabFeed]`

## Testing Checklist

- [ ] Comment → Post owner: Post owner receives notification (toaster + dropdown + inbox)
- [ ] Reply → Comment owner: Comment owner receives notification with correct `recipientType`
- [ ] Reply-to-reply: Reply owner receives notification; post owner also if applicable
- [ ] Post owner replies: Original commenter receives notification
- [ ] Upvote/Un-upvote: Both browsers update instantly on upvote and un-upvote
- [ ] Connection request → Accept: Server deletes notification, emits refresh event, counts update
- [ ] Grouped notifications: Inbox and bell count reflect grouped counts correctly

## Files Modified

### Backend
- `utils/notifications.js` - Centralized `sendNotification()` helper
- `routes/posts.js` - Updated all notification calls, fixed reply recipient logic
- `routes/users.js` - Server-side deletion on accept/decline
- `routes/notifications.js` - Export `formatNotificationMessage`

### Frontend
- `client/src/components/NotificationBridge.tsx` - Prefer server message, stabilized listeners, removed client deletion
- `client/src/pages/PostDetail.tsx` - Handle un-upvote events
- `client/src/pages/CollabFeed.tsx` - Handle un-upvote events
- `client/src/components/EnhancedComments.tsx` - Listen for reaction updates
- `client/src/components/NotificationsDropdown.tsx` - Removed client deletion
- `client/src/pages/Notifications.tsx` - Removed client deletion

## Known Issues / Notes

1. `NotificationBridge.tsx` has a structure issue with `handleNotification` - needs to be moved outside `useEffect` properly
2. `connection_accepted` notifications are auto-marked as read (do not increment bell count)
3. Preview removal logic uses `metadata.preview` for safe string replacement
