# Extended Real-Time Notification System Guide

## Overview
This guide explains the complete notification system that supports multiple event types with interactive toasts, sounds, and a flexible architecture for easy extension.

---

## 📁 File Structure

### Backend Files Created/Modified:
- `models/Notification.js` - Database model for notification persistence (ready for future use)
- `utils/notifications.js` - Reusable notification emitter utility
- `routes/users.js` - Updated to emit notifications for connection requests/acceptances
- `routes/posts.js` - Updated to emit notifications for comments and reactions

### Frontend Files Modified:
- `client/src/contexts/NotificationContext.tsx` - Extended to support multiple notification types, sounds
- `client/src/components/NotificationBridge.tsx` - Handles all notification types from Socket.IO
- `client/src/components/ToastContainer.tsx` - Interactive toasts with Accept/Decline buttons

### Sound Files Location:
- `client/public/sounds/message.mp3` - Message notification sound (you need to add this file)
- `client/public/sounds/notify.mp3` - Other notification sounds (you need to add this file)

---

## 🎯 How It Works

### 1. Backend Event Emission

#### Location: `utils/notifications.js`

**Reusable Emitter Function:**
```javascript
const { NotificationEmitter } = require('../utils/notifications');

// Connection request
await NotificationEmitter.connectionRequest(req, recipientId, actor);

// Connection accepted
await NotificationEmitter.connectionAccepted(req, recipientId, actor);

// Comment added
await NotificationEmitter.commentAdded(req, recipientId, actor, postId, commentId, content);

// Reaction added
await NotificationEmitter.reactionAdded(req, recipientId, actor, postId, commentId);
```

**How it works:**
1. Checks if recipient is the actor (prevents self-notifications)
2. Emits `notification` event via Socket.IO to recipient's personal room: `user:${recipientId}`
3. Payload includes: `type`, `actor` (user info), `metadata` (postId, userId, etc.)
4. Optional: Saves to database (currently disabled, can enable with `saveToDb: true`)

**Where it's called:**

- **Connection Request** (`routes/users.js:212`):
  ```javascript
  await NotificationEmitter.connectionRequest(req, target._id.toString(), {
    _id: me._id,
    name: me.name,
    profilePicture: me.profilePicture
  });
  ```

- **Connection Accepted** (`routes/users.js:251`):
  ```javascript
  await NotificationEmitter.connectionAccepted(req, from._id.toString(), {
    _id: me._id,
    name: me.name,
    profilePicture: me.profilePicture
  });
  ```

- **Comment Added** (`routes/posts.js:689`):
  ```javascript
  if (post.author.toString() !== req.user._id.toString()) {
    await NotificationEmitter.commentAdded(
      req,
      post.author.toString(),
      { _id: req.user._id, name: req.user.name, profilePicture: req.user.profilePicture },
      post._id.toString(),
      newComment._id.toString(),
      content
    );
  }
  ```

- **Reaction Added** (`routes/posts.js:831`):
  ```javascript
  if (comment.author.toString() !== req.user._id.toString()) {
    await NotificationEmitter.reactionAdded(...);
  }
  ```

---

### 2. Frontend Event Handling

#### Socket.IO → NotificationBridge → NotificationContext → ToastContainer

**Flow:**
1. **Socket.IO** receives `notification` event from server
2. **NotificationBridge** (`client/src/components/NotificationBridge.tsx`) listens to `socket.on('notification')`
3. Formats message based on notification type
4. Adds interactive actions for connection requests (Accept/Decline buttons)
5. Calls `showToast()` from NotificationContext
6. **NotificationContext** manages toast state, plays sounds, prevents duplicates
7. **ToastContainer** renders toasts with appropriate UI (buttons, navigation)

**NotificationBridge Logic:**
```typescript
socket.on('notification', (data) => {
  // Don't show notifications for own actions
  if (data.actor._id === user._id) return;

  const message = formatNotificationMessage(data.type, data.actor.name, data.metadata);
  
  const toastData = {
    type: data.type,
    actor: data.actor,
    message,
    metadata: data.metadata,
  };

  // Add interactive actions for connection requests
  if (data.type === 'connection_request') {
    toastData.actions = {
      accept: () => handleAcceptConnection(...),
      decline: () => handleDeclineConnection(...),
    };
  }

  showToast(toastData);
});
```

---

### 3. Interactive Toasts (Connection Requests)

**Features:**
- Accept and Decline buttons appear on connection request toasts
- Buttons call backend endpoints (`/api/users/accept/:userId` or `/api/users/decline/:userId`)
- Toast automatically dismisses after action
- 10-second auto-dismiss if no action taken (vs 5 seconds for other toasts)

**Implementation in ToastContainer:**
```typescript
{isInteractive && toast.actions && (
  <div className="flex gap-2 mt-2">
    <button onClick={() => handleAccept(toast)}>Accept</button>
    <button onClick={() => handleDecline(toast)}>Decline</button>
  </div>
)}
```

---

### 4. Notification Sounds

**Sound System:**
- **Message notifications** → `/sounds/message.mp3`
- **All other notifications** → `/sounds/notify.mp3`
- Sounds play automatically when notifications appear
- Only play for events NOT triggered by current user
- Volume set to 0.5 (adjustable)
- Fail silently if browser blocks autoplay

**Sound Toggle:**
```typescript
const { soundEnabled, setSoundEnabled } = useNotification();

// Toggle sounds
setSoundEnabled(false); // Disable
setSoundEnabled(true);  // Enable
```

**File Storage:**
- Place sound files in: `client/public/sounds/`
- Accessible at: `/sounds/message.mp3` and `/sounds/notify.mp3`
- React serves files from `public/` folder automatically

---

### 5. Duplicate Prevention

**Smart Deduplication:**
- Messages: Within 2 seconds, same conversation
- Connection requests: Within 5 seconds, same user
- Comments: Within 3 seconds, same post
- Reactions: Within 3 seconds, same comment

**Logic in NotificationContext:**
```typescript
const isDuplicate = prev.some(t => {
  if (t.type !== newToast.type) return false;
  if (t.actor._id !== newToast.actor._id) return false;
  // Type-specific duplicate checks...
});
```

---

## 📝 Notification Types

| Type | Description | Triggers When | Auto-Dismiss |
|------|-------------|---------------|-------------|
| `message` | New message received | Someone sends you a message | 5 seconds |
| `connection_request` | Connection request | Someone sends you a connection request | 10 seconds (interactive) |
| `connection_accepted` | Request accepted | Someone accepts your connection request | 5 seconds |
| `comment_added` | Comment on your post | Someone comments on your post | 5 seconds |
| `reaction_added` | Reaction to your comment | Someone reacts ❤️ to your comment | 5 seconds |

---

## 🎨 Toast UI Features

- **Avatar** - Shows actor's profile picture
- **Name** - Actor's name
- **Message** - Formatted notification message
- **Close Button** - X icon to dismiss
- **Navigation** - Clicking navigates to relevant page:
  - Messages → `/app/messages?open={conversationId}`
  - Comments/Reactions → `/app/feed/{postId}`
  - Connection accepted → `/app/profile/{userId}`
- **Interactive Buttons** - Accept/Decline for connection requests

---

## 🔧 Adding New Notification Types

### Step 1: Update Backend (`utils/notifications.js`)
```javascript
NotificationEmitter.yourNewType = async (req, recipientId, actor, ...otherParams) => {
  await emitNotification(req, {
    type: 'your_new_type',
    recipientId,
    actor,
    metadata: { /* relevant data */ }
  });
};
```

### Step 2: Update Frontend Types (`NotificationContext.tsx`)
```typescript
export type NotificationType = 
  | 'message' 
  | 'connection_request'
  | 'your_new_type'; // Add here
```

### Step 3: Update Message Formatting (`NotificationBridge.tsx`)
```typescript
const formatNotificationMessage = (type: NotificationType, ...) => {
  switch (type) {
    case 'your_new_type':
      return `${actorName} did something`;
    // ...
  }
};
```

### Step 4: Update Navigation (`ToastContainer.tsx`)
```typescript
if (toast.type === 'your_new_type' && toast.metadata?.someId) {
  navigate(`/app/your-route/${toast.metadata.someId}`);
}
```

---

## 🔔 Notification Persistence (Future)

**Database Model Ready:**
- `models/Notification.js` - Schema includes:
  - `recipient`, `type`, `actor`, `relatedId`, `metadata`
  - `read`, `readAt` - For unread count tracking
  - Indexes for efficient queries

**To Enable Persistence:**
1. Set `saveToDb: true` in `utils/notifications.js` `emitNotification()` call
2. Create API routes to fetch notifications
3. Add unread count badge
4. Create notification center UI

---

## ✅ Testing Checklist

- [ ] Add sound files to `client/public/sounds/`
- [ ] Test connection request notification (should show Accept/Decline buttons)
- [ ] Test connection accepted notification
- [ ] Test comment notification (should navigate to post)
- [ ] Test reaction notification (should navigate to post)
- [ ] Verify sounds play (check browser console if they don't)
- [ ] Verify no duplicates appear when spamming events
- [ ] Verify notifications don't show for own actions
- [ ] Test on different routes (Home, Wallet, Feed, etc.)

---

## 🐛 Troubleshooting

**Sounds not playing:**
- Check browser autoplay policy (may require user interaction first)
- Verify files exist in `client/public/sounds/`
- Check browser console for errors
- Ensure `soundEnabled` is `true` in NotificationContext

**Notifications not appearing:**
- Check Socket.IO connection (ensure `isConnected` is true)
- Verify backend is emitting to correct room: `user:${recipientId}`
- Check browser console for socket events
- Ensure actor is not the current user (won't notify self)

**Duplicate notifications:**
- Adjust deduplication time windows in `NotificationContext.tsx`
- Check if multiple listeners are attached (should only be one)

---

## 📚 Summary

**Backend:**
- Reusable emitter in `utils/notifications.js`
- Called from routes (users.js, posts.js)
- Emits to Socket.IO room: `user:${recipientId}`

**Frontend:**
- NotificationBridge listens to `socket.on('notification')`
- NotificationContext manages state and sounds
- ToastContainer renders UI with interactive buttons
- Works globally across all routes

**Extension:**
- Easy to add new types via the utility functions
- Flexible metadata structure
- Database model ready for persistence

