# Messaging Module Documentation

## 📁 File Structure

### Core Files

#### **Server-Side (Backend)**
1. **`routes/messages.js`**
   - **Purpose**: HTTP endpoints for message operations
   - **Key Functions**:
     - `POST /conversations/:id/messages` - Send a message
     - `POST /conversations/:id/read` - Mark messages as read
     - `POST /conversations/:id/typing` - Typing indicator
   - **Status Updates**: Creates message, emits `message:sent` event

2. **`server.js`**
   - **Purpose**: Socket.IO server setup and event handlers
   - **Key Handlers**:
     - `socket.on('message:received')` - Handles delivery ACK from recipient
     - Emits `message:delivered` to sender
     - Handles offline-to-online message delivery

3. **`models/Message.js`**
   - **Purpose**: Message database schema
   - **Fields**:
     - `deliveredTo: [{ userId, deliveredAt }]` - Delivery tracking
     - `seenBy: [userId]` - Read tracking
     - `sender`, `conversation`, `content`, `attachments`

#### **Client-Side (Frontend)**
1. **`client/src/pages/Messages.tsx`** ⭐ **MAIN FILE**
   - **Purpose**: Main messaging UI and logic
   - **Key Responsibilities**:
     - Message sending/receiving
     - Status management (Sending → Sent → Delivered → Read)
     - Sound triggering
     - Real-time updates

2. **`client/src/contexts/SocketContext.tsx`**
   - **Purpose**: Socket.IO client connection and event registration
   - **Key Functions**:
     - `onMessageSent()` - Register handler for `message:sent` event
     - `onMessageDelivered()` - Register handler for `message:delivered` event
     - `onMessageNew()` - Register handler for `message:new` event
     - `onMessageSeen()` - Register handler for `message:seen` event
     - `ackMessageReceived()` - Send ACK when recipient receives message

3. **`client/src/hooks/useChatSounds.ts`**
   - **Purpose**: Sound playback logic
   - **Functions**:
     - `playMessageSent()` - Plays `message_sent.mp3`
     - `playMessageReceived()` - Plays `message_received.mp3`
     - `playMessageRead()` - Plays `message_read.mp3`
     - `playTyping()` - Plays `typing.mp3`

---

## 🔄 Expected Sequence Flow

### **Message Sending Flow**

```
1. User sends message
   ↓
2. Client: Optimistic UI update (status = "In progress...")
   ↓
3. Client: POST /conversations/:id/messages
   ↓
4. Server: Create message in DB
   ↓
5. Server: Emit message:sent → sender's personal room (user:${senderId})
   ↓
6. Client (Sender): Receives message:sent event
   - Status updated to "Sent"
   - 🎵 message_sent.mp3 plays (if viewing conversation)
   ↓
7. Server: Emit message:new → recipient's personal room + conversation room
   ↓
8. Client (Recipient): Receives message:new event
   - Auto-ACKs with message:received
   - 🎵 message_received.mp3 plays (if viewing conversation)
   ↓
9. Server: Receives message:received ACK
   - Marks message as delivered in DB (deliveredTo array)
   - Emits message:delivered → sender's personal room
   ↓
10. Client (Sender): Receives message:delivered event
    - Status updated to "Delivered"
    - ❌ NO SOUND (sound already played on "Sent")
```

### **Message Read Flow**

```
1. Recipient opens conversation
   ↓
2. Client: POST /conversations/:id/read
   ↓
3. Server: Mark messages as seen (seenBy array)
   ↓
4. Server: Emit message:seen → sender's personal room + conversation room
   ↓
5. Client (Sender): Receives message:seen event
   - Status updated to "Read"
   - 🎵 message_read.mp3 plays (if viewing conversation)
   - Read indicator (tiny profile picture) appears
```

---

## 📍 Where Status Changes Happen

### **Status: "In progress..." → "Sent"**

**Location**: `client/src/pages/Messages.tsx` (lines 284-327)

**Trigger**: `onMessageSent()` handler receives `message:sent` event from server

**Code**:
```typescript
onMessageSent((payload) => {
  // 1. Mark sound as played IMMEDIATELY (prevents race conditions)
  const shouldPlaySound = !sentSoundPlayedRef.current.has(payload.messageId);
  if (shouldPlaySound) {
    sentSoundPlayedRef.current.add(payload.messageId);
  }
  
  // 2. Update status to 'Sent' synchronously
  flushSync(() => {
    setMessageStatus(prev => {
      if (!prev[payload.messageId] || prev[payload.messageId] === 'In progress...') {
        return { ...prev, [payload.messageId]: 'Sent' };
      }
      return prev;
    });
  });
  
  // 3. Play sound if conditions met
  if (shouldPlaySound && /* viewing conversation && tab visible */) {
    playMessageSent(); // 🎵 message_sent.mp3
  }
});
```

**Server Emission**: `routes/messages.js` (lines 118-129)
```javascript
io.to(`user:${req.user._id}`).emit('message:sent', {
  conversationId: id,
  messageId: msg._id.toString()
});
```

---

### **Status: "Sent" → "Delivered"**

**Location**: `client/src/pages/Messages.tsx` (lines 329-345)

**Trigger**: `onMessageDelivered()` handler receives `message:delivered` event from server

**Code**:
```typescript
onMessageDelivered((payload) => {
  // 1. Mark sound as played IMMEDIATELY (prevents replay)
  if (!sentSoundPlayedRef.current.has(payload.messageId)) {
    sentSoundPlayedRef.current.add(payload.messageId);
  }
  
  // 2. Update status to 'Delivered'
  setMessageStatus(prev => {
    return { ...prev, [payload.messageId]: 'Delivered' };
  });
  
  // ❌ NO SOUND - sound should have already played on "Sent"
});
```

**Server Emission**: `server.js` (lines 274-314)
- Recipient ACKs with `message:received`
- Server marks message as delivered in DB
- Server emits `message:delivered` to sender

---

### **Status: "Delivered" → "Read"**

**Location**: `client/src/pages/Messages.tsx` (lines 361-444)

**Trigger**: `onMessageSeen()` handler receives `message:seen` event from server

**Code**:
```typescript
onMessageSeen(async (payload) => {
  // 1. Update messages with read state
  flushSync(() => {
    setMessages(prev => {
      return prev.map(msg => {
        if (/* is our message && not already read */) {
          return {
            ...msg,
            seenBy: [...(msg.seenBy || []), otherParticipantId]
          };
        }
        return msg;
      });
    });
  });
  
  // 2. Play sound if new read detected
  if (newlyReadMessages.length > 0) {
    playMessageRead(); // 🎵 message_read.mp3
  }
});
```

**Server Emission**: `routes/messages.js` (lines 327-336)
- Recipient calls `POST /conversations/:id/read`
- Server marks messages as seen (seenBy array)
- Server emits `message:seen` to sender

---

## 🎵 Sound Triggering Logic

### **Sound Triggering is NOT Directly Tied to Status**

**Important**: Sounds are triggered by **events**, not by status changes. However, status changes happen as a **side effect** of receiving events.

### **message_sent.mp3**

**Should Always Play**: ✅ **YES** - When status becomes "Sent"

**Trigger Location**: `client/src/pages/Messages.tsx` (line 318)
- **Event**: `message:sent` from server
- **Conditions**:
  1. Sound hasn't been played yet (`!sentSoundPlayedRef.current.has(messageId)`)
  2. User is viewing the conversation (`selectedConversationIdRef.current === conversationId`)
  3. Tab is visible (`document.visibilityState === 'visible'`)
  4. Active conversation matches (`window.__activeConversationId === conversationId`)

**Problem**: ⚠️ **Sometimes plays on "Delivered" instead of "Sent"**

**Root Cause**: Race condition where `message:delivered` arrives before `message:sent` (when recipient is online and ACKs immediately)

**Current Fix**: 
- Server emits `message:sent` **FIRST** (before `message:new`)
- Client marks sound as played immediately in both handlers
- Client only plays sound in `onMessageSent`, never in `onMessageDelivered`

---

### **message_received.mp3**

**Should Only Play When**: Recipient is viewing the conversation

**Trigger Location**: `client/src/pages/Messages.tsx` (lines 237-267)
- **Event**: `message:new` from server
- **Conditions**:
  1. Message is from another user (not self)
  2. User is viewing the conversation
  3. Tab is visible

**Code**:
```typescript
onMessageNew((data) => {
  if (/* from another user && viewing conversation && tab visible */) {
    playMessageReceived(); // 🎵 message_received.mp3
  }
});
```

---

### **message_read.mp3**

**Should Play Immediately**: ✅ **YES** - When status becomes "Read"

**Trigger Location**: `client/src/pages/Messages.tsx` (lines 375-444)
- **Event**: `message:seen` from server
- **Conditions**:
  1. New read detected (not previously tracked)
  2. Sound hasn't been played for this message yet
  3. User is viewing the conversation
  4. Tab is visible

**Synchronization**: Uses `flushSync()` to ensure read indicator appears **before** sound plays

---

## 🐛 Known Issues & Fixes

### **Issue: message_sent.mp3 plays on "Delivered" instead of "Sent"**

**Symptom**: When recipient is online, `message_sent.mp3` sometimes plays when status changes to "Delivered" instead of "Sent"

**Root Cause**: 
1. When recipient is online, they ACK immediately
2. `message:delivered` event can arrive before or at the same time as `message:sent`
3. If sound logic was tied to status changes, it would play on "Delivered"

**Current Fix** (Implemented):
1. Server emits `message:sent` **FIRST** (before `message:new`)
2. Client plays sound **ONLY** in `onMessageSent` handler
3. Client marks sound as played immediately to prevent replay
4. Client never plays sound in `onMessageDelivered` handler

**Verification**:
- Check console logs for `[socket] message:sent event received:` and `[socket] message:delivered event received:`
- Verify `message:sent` arrives before `message:delivered`
- Verify sound plays only when `message:sent` is received

---

## 🔍 Debugging Tips

### **Check Event Order**
```javascript
// In browser console, look for:
[socket] message:sent event received: { conversationId, messageId }
[Messages] ✅ Marked sent sound as played for message: <messageId>
[Messages] 🔊 Playing sent sound IMMEDIATELY (message:sent event): <messageId>
[socket] message:delivered event received: { conversationId, messageId }
```

### **Check Status Transitions**
```javascript
// In browser console, monitor messageStatus state:
// Should see: "In progress..." → "Sent" → "Delivered" → "Read"
```

### **Check Sound Playback**
```javascript
// In browser console, look for:
[ChatSounds] 🔊 Playing sent sound
[ChatSounds] 🔊 Playing received sound
[ChatSounds] 🔊 Playing read sound
```

---

## 📊 Status Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MESSAGE STATUS FLOW                       │
└─────────────────────────────────────────────────────────────┘

User Sends Message
        │
        ├─→ Optimistic UI: "In progress..."
        │
        ├─→ POST /conversations/:id/messages
        │
        ├─→ Server: Create message in DB
        │
        ├─→ Server: Emit message:sent → sender
        │   │
        │   └─→ Client: Status = "Sent"
        │       └─→ 🎵 message_sent.mp3 (if viewing conversation)
        │
        ├─→ Server: Emit message:new → recipient
        │   │
        │   └─→ Client: Auto-ACK with message:received
        │       └─→ 🎵 message_received.mp3 (if viewing conversation)
        │
        ├─→ Server: Receive message:received ACK
        │   │
        │   ├─→ Mark as delivered in DB (deliveredTo array)
        │   │
        │   └─→ Emit message:delivered → sender
        │       │
        │       └─→ Client: Status = "Delivered"
        │           └─→ ❌ NO SOUND (already played on "Sent")
        │
        └─→ Recipient opens conversation
            │
            ├─→ POST /conversations/:id/read
            │
            ├─→ Server: Mark as seen (seenBy array)
            │
            └─→ Server: Emit message:seen → sender
                │
                └─→ Client: Status = "Read"
                    └─→ 🎵 message_read.mp3 (if viewing conversation)
                    └─→ Read indicator appears
```

---

## ✅ Summary

### **Key Points**:

1. **Status Changes**: Happen in `client/src/pages/Messages.tsx` via event handlers
2. **Sound Triggering**: Based on **events**, not directly on status changes
3. **message_sent.mp3**: Should **always** play when `message:sent` event is received (status = "Sent")
4. **message_received.mp3**: Should **only** play when recipient receives message while viewing conversation
5. **message_read.mp3**: Should play **immediately** when `message:seen` event is received (status = "Read")

### **File Paths for Inspection**:

- **Message Sending**: `routes/messages.js` (lines 80-139)
- **Status Updates**: `client/src/pages/Messages.tsx` (lines 284-444)
- **Sound Triggering**: `client/src/pages/Messages.tsx` (lines 237-267, 284-327, 361-444)
- **Sound Playback**: `client/src/hooks/useChatSounds.ts`
- **Socket Events**: `client/src/contexts/SocketContext.tsx`
- **Delivery Handling**: `server.js` (lines 274-314)

### **Expected Behavior**:

✅ `message_sent.mp3` should play when status becomes "Sent" (via `message:sent` event)  
✅ `message_received.mp3` should play when recipient receives message (via `message:new` event)  
✅ `message_read.mp3` should play when status becomes "Read" (via `message:seen` event)  
❌ `message_sent.mp3` should **NOT** play when status becomes "Delivered"

---

## 🚨 If Issues Persist

If `message_sent.mp3` still plays on "Delivered":

1. **Check Server Logs**: Verify `message:sent` is emitted before `message:new`
2. **Check Client Logs**: Verify event order in browser console
3. **Check Race Conditions**: Add timestamps to events to verify order
4. **Check Sound Tracking**: Verify `sentSoundPlayedRef` is working correctly
5. **Check Event Handlers**: Ensure `onMessageDelivered` never calls `playMessageSent()`

