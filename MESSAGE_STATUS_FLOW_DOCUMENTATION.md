# Message Status Flow - Complete End-to-End Documentation

## 📋 Overview

This document explains the complete message status update flow in our system, from backend event emission to UI rendering. It covers the sequence of events, conditions for status transitions, how backward transitions are prevented, and how realtime updates are handled.

---

## 🔄 Status Hierarchy

**Priority Order** (higher number = higher priority):
- `In progress...` = 0
- `Sent` = 1
- `Delivered` = 2
- `Read` = 3

**Rule**: Status can only move forward (up in priority), never backward. Once a message reaches "Read", it can never show "Sent" or "Delivered" again.

---

## 🎯 Backend Event Sequence

### 1. **Message Creation Flow**

**Location**: `routes/messages.js` (POST `/conversations/:id/messages`)

```
User sends message
    ↓
Client: Optimistic UI update → "In progress..." (temp message ID)
    ↓
POST /conversations/:id/messages
    ↓
Server: Create message in DB
    ↓
Server: Emit events (IN ORDER):
    1. message:sent → sender's personal room (user:${senderId})
       - Payload: { conversationId, messageId, seq: 1, timestamp }
       - Sequence: 1 (Sent = 1)
    2. message:new → recipient's personal room + conversation room
       - Payload: { conversationId, message }
    3. conversation:update → all clients
    ↓
Client (Recipient): Receives message:new
    ↓
Client (Recipient): Auto-ACKs with message:received
    ↓
Server: Receives message:received ACK
    ↓
Server: Marks message as delivered in DB (deliveredTo array)
    ↓
Server: Buffers delivery (150ms default) → Emits message:delivered
    - Payload: { conversationId, messageId, seq: 2, timestamp }
    - Sequence: 2 (Delivered = 2)
    - Target: sender's personal room (user:${senderId})
```

### 2. **Message Read Flow**

**Location**: `routes/messages.js` (POST `/conversations/:id/read`)

```
Recipient opens conversation
    ↓
Client: POST /conversations/:id/read
    ↓
Server: Mark messages as seen (seenBy array)
    ↓
Server: Emit message:seen → sender's personal room + conversation room
    - Payload: { conversationId, userId, seq: 3, timestamp }
    - Sequence: 3 (Read = 3)
    ↓
Client (Sender): Receives message:seen event
    ↓
Client (Sender): Updates status to "Read" IMMEDIATELY (bypasses all buffers)
```

---

## 🚦 Event Triggers and Conditions

### **Status: "In progress..." → "Sent"**

**Trigger**: `message:sent` event from server

**Conditions**:
- Message must be sent by current user
- Previous status must be "In progress..." or unset
- Event sequence must be >= last processed sequence

**Implementation**: `client/src/pages/Messages.tsx` (lines 366-508)

**Sound**: 🎵 `message_sent.mp3` plays (if viewing conversation && tab visible)

**Key Logic**:
```typescript
// Check sequence number - ignore older events
const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
if (eventSeq < lastSeq) {
  // Ignore older events
  return;
}

// Update status to "Sent" synchronously
flushSync(() => {
  setMessageStatus(prev => {
    if (!prev[messageId] || prev[messageId] === 'In progress...') {
      return { ...prev, [messageId]: 'Sent' };
    }
    return prev;
  });
});

// Play sound if conditions met
if (shouldPlaySound && viewingConversation && tabVisible) {
  playMessageSent();
}
```

---

### **Status: "Sent" → "Delivered"**

**Trigger**: `message:delivered` event from server

**Conditions**:
- Message must be sent by current user
- Previous status must be "Sent" or lower
- Event sequence must be >= last processed sequence (seq >= 2)
- Recipient must have ACKed with `message:received`

**Implementation**: 
- **Server**: `server.js` (lines 474-578) - ACK handler with delivery buffer
- **Client**: `client/src/pages/Messages.tsx` (lines 510-608)

**Sound**: ❌ NO SOUND (sound already played on "Sent")

**Key Logic**:
```typescript
// Server-side: Buffer delivery to coalesce rapid updates
deliveryBuffer.bufferDelivery(
  {
    conversationId,
    messageId,
    senderId,
    recipientId,
    deviceId,
    statusSeq: 2,
    timestamp: deliveredTimestamp,
  },
  emitDelivered,
  isUrgent // false for normal deliveries
);

// Client-side: Route through unified dispatcher for buffering
dispatcher.dispatch({
  type: 'message:delivered',
  payload: {
    conversationId,
    messageId,
    seq: eventSeq,
    timestamp: payload.timestamp,
  },
});
```

**Buffering**: 
- Server buffers for 150ms (configurable via `DELIVERED_BUFFER_MS`)
- Client buffers for 100ms (via unified dispatcher)
- Prevents UI flicker from rapid Sent → Delivered transitions

---

### **Status: "Delivered" → "Read"**

**Trigger**: `message:seen` event from server

**Conditions**:
- Message must be sent by current user
- Previous status must be "Delivered" or lower
- Event sequence must be >= last processed sequence (seq >= 3)
- Recipient must have opened the conversation (POST `/conversations/:id/read`)

**Implementation**: 
- **Server**: `routes/messages.js` (lines 278-379)
- **Client**: `client/src/pages/Messages.tsx` (lines 967-1083)

**Sound**: 🎵 `message_read.mp3` plays IMMEDIATELY (if viewing conversation && tab visible)

**Key Logic**:
```typescript
// CRITICAL: Read status - apply IMMEDIATELY, bypass all buffers
flushSync(() => {
  setMessageStatus(prev => {
    if (prev[messageId] !== 'Read') {
      return { ...prev, [messageId]: 'Read' };
    }
    return prev;
  });
  
  setRenderedStatus(prev => {
    if (prev[messageId] !== 'Read') {
      return { ...prev, [messageId]: 'Read' };
    }
    return prev;
  });
});

// Play read sound IMMEDIATELY after status update
playMessageRead();
```

**No Buffering**: Read status is applied immediately (bypasses all buffers) because it's the final state and should be visible instantly.

---

## ⚡ Status Skipping Conditions

### **Scenario 1: Recipient Already Online**

**Condition**: Recipient is online and viewing the conversation when message is sent

**Flow**:
```
1. message:sent → Status: "Sent"
2. message:new → Recipient receives immediately
3. Recipient ACKs immediately → message:delivered arrives quickly
4. Status: "Delivered" (may arrive before UI finishes rendering "Sent")
5. If recipient opens conversation immediately → Status: "Read"
```

**Result**: UI may skip showing "Sent" if "Delivered" arrives very quickly (within buffer window). This is intentional - we only show the highest status.

### **Scenario 2: Recipient Offline → Online**

**Condition**: Recipient comes online after message was sent

**Flow**:
```
1. message:sent → Status: "Sent"
2. Recipient is offline → No ACK
3. Recipient comes online → Server processes offline-to-online delivery
4. Server emits message:delivered → Status: "Delivered"
5. If recipient opens conversation → Status: "Read"
```

**Implementation**: `server.js` (lines 354-428) - Offline-to-online delivery handler

### **Scenario 3: fetchMessages() Initial Load**

**Condition**: User opens conversation and fetches messages from DB

**Flow**:
```
1. fetchMessages() loads messages from DB
2. For each message sent by user:
   - Check seenBy array → If found: Status = "Read"
   - Else check deliveredTo array → If found: Status = "Delivered"
   - Else: Status = "Sent"
3. UI displays highest status immediately
```

**Implementation**: `client/src/pages/Messages.tsx` (lines 1582-1715)

**Key Logic**:
```typescript
// Check if message was seen (highest priority)
if (msg.seenBy && Array.isArray(msg.seenBy) && msg.seenBy.some(id => idStr === otherParticipantIdStr)) {
  newStatus = 'Read';
} 
// Check if message was delivered
else if (msg.deliveredTo && Array.isArray(msg.deliveredTo) && msg.deliveredTo.some(d => d.userId.toString() === otherParticipantIdStr)) {
  newStatus = 'Delivered';
}
// Otherwise, default to 'Sent'
else {
  newStatus = 'Sent';
}
```

**Sound**: ❌ NO SOUND on fetchMessages() - sound only plays on realtime events (message:sent, message:read)

---

## 🛡️ Preventing Backward Transitions

### **1. Sequence Number Tracking**

**Location**: `client/src/pages/Messages.tsx` (line 110)

**Implementation**:
```typescript
const messageSeqRef = useRef<Map<string, number>>(new Map()); // messageId -> last processed seq

// Check sequence number before processing
const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
if (eventSeq < lastSeq) {
  console.log(`⏭️ Ignoring older event (seq ${eventSeq} < ${lastSeq})`);
  return; // Ignore older events
}

// Update sequence tracking
messageSeqRef.current.set(messageId, eventSeq);
```

**Rule**: Events with lower sequence numbers are ignored, preventing out-of-order updates.

---

### **2. Highest Status Tracking**

**Location**: `client/src/pages/Messages.tsx` (lines 1197-1255)

**Implementation**:
```typescript
const getHighestStatus = useCallback((messageId: string, message?: Message) => {
  const statuses: string[] = [];
  
  // Check renderedStatus (what's currently displayed)
  if (renderedStatus[messageId]) {
    statuses.push(renderedStatus[messageId]);
  }
  
  // Check messageStatus (internal tracking)
  if (messageStatus[messageId]) {
    statuses.push(messageStatus[messageId]);
  }
  
  // Check bufferedStatusRef (pending updates)
  const buffered = bufferedStatusRef.current.get(messageId);
  if (buffered) {
    statuses.push(buffered);
  }
  
  // Check message object for delivery/read status
  if (message) {
    if (message.seenBy && Array.isArray(message.seenBy) && message.seenBy.length > 0) {
      statuses.push('Read');
    }
    if (message.deliveredTo && Array.isArray(message.deliveredTo) && message.deliveredTo.length > 0) {
      statuses.push('Delivered');
    }
  }
  
  // Find the highest priority status
  return highestStatus;
}, [renderedStatus, messageStatus]);
```

**Rule**: Only accept new status if it's STRICTLY higher than the highest current status across ALL sources.

---

### **3. Status Priority Enforcement**

**Location**: `client/src/pages/Messages.tsx` (lines 1185-1195, 1290-1304)

**Implementation**:
```typescript
const getStatusPriority = useCallback((status: string): number => {
  const statusOrder: Record<string, number> = {
    'In progress...': 0,
    'Sent': 1,
    'Delivered': 2,
    'Read': 3,
  };
  return statusOrder[status] ?? -1;
}, []);

// Only accept new status if it's STRICTLY higher
const highestCurrentPriority = getStatusPriority(highestCurrentStatus || '');
const newPriority = getStatusPriority(status);
const isHigherThanCurrent = newPriority > highestCurrentPriority;

if (!isHigherThanCurrent) {
  console.log(`⏭️ Skipping backward status transition`);
  return; // Reject backward transition
}
```

**Rule**: New status must have higher priority than current status, preventing any backward transitions.

---

### **4. "In progress..." Protection**

**Location**: `client/src/pages/Messages.tsx` (lines 1294-1304)

**Implementation**:
```typescript
// NEVER accept "In progress..." if:
// 1. Message has already been sent (in sentMessagesRef), OR
// 2. Highest current status is "Sent" or higher (priority >= 1), OR
// 3. Message has a real ID (not temp) - real messages should never show "In progress..."
const isInProgressStatus = status === 'In progress...';
const isMessageSent = sentMessagesRef.current.has(messageId);
const hasRealId = message && !message._id.startsWith('temp-');
const isNotInProgressAfterSend = !isInProgressStatus || (!isMessageSent && highestCurrentPriority < 1 && !hasRealId);

if (!isNotInProgressAfterSend) {
  return; // Reject "In progress..." for sent messages
}
```

**Rule**: Once a message is sent, it can never show "In progress..." again.

---

## 🎨 UI Rendering Logic

### **Status Display Rules**

**Location**: `client/src/pages/Messages.tsx` (lines 2138-2210)

**Implementation**:
```typescript
// Get the highest status across all sources
const highestStatus = getHighestStatus(message._id, message);

// Determine what to show
if (highestStatus === 'Read') {
  // Show read indicator (tiny profile picture)
  shouldShowReadIndicator = true;
} else if (highestStatus === 'Delivered') {
  // Show "Delivered" text (only if not read)
  shouldShowStatusText = !isSeenByOther;
} else if (highestStatus === 'Sent') {
  // Show "Sent" text (only if not delivered or read)
  shouldShowStatusText = !isSeenByOther && !isDelivered;
} else if (highestStatus === 'In progress...') {
  // Show "In progress..." (only for temp messages)
  shouldShowStatusText = message._id.startsWith('temp-');
}
```

**Rule**: Only show the highest available status. Skip intermediate statuses if a higher one is already available.

---

### **Rendering Buffer**

**Location**: `client/src/pages/Messages.tsx` (lines 1404-1437)

**Implementation**:
```typescript
// Buffer status updates to prevent visual jumps
const timer = setTimeout(() => {
  const latestStatus = bufferedStatusRef.current.get(messageId);
  if (latestStatus) {
    // Final check before rendering - get highest status across ALL sources
    const highestStatusBeforeRender = getHighestStatus(messageId, currentMessage, prev, messageStatus);
    const highestPriorityBeforeRender = getStatusPriority(highestStatusBeforeRender || '');
    const latestPriority = getStatusPriority(latestStatus);
    
    // Only render if latest status is strictly higher than highest current status
    const shouldRender = latestPriority > highestPriorityBeforeRender;
    
    if (shouldRender) {
      setRenderedStatus(prev => {
        const next = { ...prev };
        next[messageId] = latestStatus;
        return next;
      });
    }
  }
}, STATUS_RENDER_BUFFER_MS); // 100ms buffer
```

**Rule**: Buffer status updates for 100ms to coalesce rapid transitions (e.g., Sent → Delivered). Only render the final state.

**Exception**: "Read" status bypasses the buffer and renders immediately.

---

## 🔄 Realtime Update Handling

### **1. Unified Notification Dispatcher**

**Location**: `client/src/services/NotificationDispatcher.ts`

**Purpose**: Buffers and coalesces all status updates before dispatching to UI

**Features**:
- Configurable buffer delay (default: 150ms, tunable 100-2000ms)
- Event coalescing/deduplication
- High-priority event bypass (Read status)
- Metrics tracking (latency, duplicate counts, coalesce rates)

**Implementation**:
```typescript
// Buffer status updates
buffer.push({
  type: 'message:delivered',
  payload: { conversationId, messageId, seq, timestamp },
});

// Coalesce duplicates (same messageId, higher seq replaces lower seq)
if (existingEvent && newEvent.seq > existingEvent.seq) {
  // Replace with newer event
  buffer[index] = newEvent;
}

// Dispatch after buffer delay
setTimeout(() => {
  dispatchBufferedEvents();
}, BUFFER_DELAY_MS);
```

---

### **2. Sequence Number Validation**

**Location**: `client/src/pages/Messages.tsx` (lines 1285-1288)

**Implementation**:
```typescript
// Check sequence number to prevent out-of-order updates
const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
const isNewerSeq = eventSeq > lastSeq || (eventSeq === lastSeq && eventTimestamp > lastTimestamp);
const isValidSequence = eventSeq === 0 || isNewerSeq || eventSeq >= lastSeq;

if (!isValidSequence) {
  console.log(`⏭️ Ignoring out-of-order event (seq ${eventSeq} < ${lastSeq})`);
  return; // Ignore older events
}
```

**Rule**: Events with lower sequence numbers are ignored, preventing out-of-order updates.

---

### **3. Deduplication**

**Location**: 
- **Server**: `server.js` (lines 178-204) - Delivery buffer deduplication
- **Client**: `client/src/services/NotificationDispatcher.ts` (lines 160-163) - Event signature deduplication

**Implementation**:
```typescript
// Server-side: Deduplicate by messageId + deviceId + recipientId
const existing = pendingDeliveries.get(messageId);
if (existing && existing.deviceId === deviceId && existing.recipientId === recipientId) {
  console.log(`⏭️ Duplicate delivery ACK detected, skipping`);
  return; // Skip duplicate
}

// Client-side: Deduplicate by event signature
const signature = `${event.type}:${event.payload.messageId}:${event.payload.seq}`;
const lastTimestamp = eventSignatures.get(signature);
if (lastTimestamp && Date.now() - lastTimestamp < DEDUP_WINDOW_MS) {
  console.log(`⏭️ Duplicate event detected, skipping`);
  return; // Skip duplicate
}
```

**Rule**: Duplicate events within a time window are ignored.

---

### **4. Outdated Event Handling**

**Location**: `client/src/pages/Messages.tsx` (lines 1285-1304)

**Implementation**:
```typescript
// Check if event is outdated
const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
const isOutdated = eventSeq < lastSeq;

// Check if status is lower than current
const highestCurrentStatus = getHighestStatus(messageId, message);
const highestCurrentPriority = getStatusPriority(highestCurrentStatus || '');
const newPriority = getStatusPriority(status);
const isLowerThanCurrent = newPriority <= highestCurrentPriority;

if (isOutdated || isLowerThanCurrent) {
  console.log(`⏭️ Ignoring outdated event (seq ${eventSeq} < ${lastSeq} or priority ${newPriority} <= ${highestCurrentPriority})`);
  return; // Ignore outdated events
}
```

**Rule**: Events with lower sequence numbers or lower priority than current status are ignored.

---

## 📊 Example Scenarios

### **Scenario 1: Normal Flow (Recipient Online)**

```
1. Sender sends message
   → Status: "In progress..." (optimistic)
   → POST /conversations/:id/messages
   
2. Server emits message:sent
   → Status: "Sent" ✅
   → 🎵 message_sent.mp3 plays
   
3. Recipient receives message:new
   → Recipient ACKs with message:received
   
4. Server emits message:delivered (buffered 300ms)
   → Status: "Delivered" ✅
   → ❌ NO SOUND (already played on "Sent")
   
5. Recipient opens conversation
   → Server emits message:seen
   → Status: "Read" ✅
   → 🎵 message_read.mp3 plays IMMEDIATELY
```

**UI Display**: 
- Initially: "Sent"
- After 300ms: "Delivered" (if buffer completes)
- After read: "Read" (immediate, no buffer)

---

### **Scenario 2: Fast Delivery (Recipient Viewing Conversation)**

```
1. Sender sends message
   → Status: "In progress..." (optimistic)
   → POST /conversations/:id/messages
   
2. Server emits message:sent
   → Status: "Sent" ✅
   → 🎵 message_sent.mp3 plays
   
3. Recipient is viewing conversation → ACKs immediately
   → Server emits message:delivered (buffered 150ms)
   → Status: "Delivered" ✅ (may skip "Sent" in UI if buffer coalesces)
   
4. Recipient is still viewing → Server emits message:seen immediately
   → Status: "Read" ✅ (immediate, bypasses buffer)
   → 🎵 message_read.mp3 plays IMMEDIATELY
```

**UI Display**: 
- May show "Delivered" directly (if "Sent" is coalesced)
- Then "Read" immediately

---

### **Scenario 3: Offline → Online Delivery**

```
1. Sender sends message
   → Status: "Sent" ✅
   → 🎵 message_sent.mp3 plays
   
2. Recipient is offline → No ACK
   → Status remains: "Sent"
   
3. Recipient comes online
   → Server processes offline-to-online delivery
   → Server emits message:delivered (buffered 150ms)
   → Status: "Delivered" ✅
   
4. Recipient opens conversation
   → Server emits message:seen
   → Status: "Read" ✅
   → 🎵 message_read.mp3 plays IMMEDIATELY
```

**UI Display**: 
- "Sent" → "Delivered" → "Read"

---

### **Scenario 4: Out-of-Order Events (Race Condition)**

```
1. Server emits message:sent (seq: 1)
   → Client receives and processes
   → Status: "Sent" ✅
   → Sequence: 1
   
2. Server emits message:delivered (seq: 2) [arrives first due to network]
   → Client checks sequence: 2 > 1 ✅
   → Client processes
   → Status: "Delivered" ✅
   → Sequence: 2
   
3. Server emits message:sent (seq: 1) [arrives late]
   → Client checks sequence: 1 < 2 ❌
   → Client ignores (out-of-order)
   → Status remains: "Delivered" ✅
```

**UI Display**: 
- "Delivered" (correct final state, older "Sent" event ignored)

---

### **Scenario 5: Backward Transition Attempt**

```
1. Status: "Read" ✅ (seq: 3)
   
2. Client receives message:delivered (seq: 2) [late arrival]
   → Client checks sequence: 2 < 3 ❌
   → Client ignores (out-of-order)
   
3. Client checks priority: "Delivered" (2) < "Read" (3) ❌
   → Client ignores (lower priority)
   
4. Status remains: "Read" ✅
```

**UI Display**: 
- "Read" (backward transition prevented)

---

## 📍 Implementation Locations

### **Server-Side**

1. **Message Creation**: `routes/messages.js` (lines 80-276)
   - Emits `message:sent` (seq: 1)
   - Emits `message:new`
   - Emits `conversation:update`

2. **Delivery ACK Handler**: `server.js` (lines 474-578)
   - Receives `message:received` ACK
   - Marks message as delivered in DB
   - Buffers delivery (150ms)
   - Emits `message:delivered` (seq: 2)

3. **Read Handler**: `routes/messages.js` (lines 278-379)
   - Receives POST `/conversations/:id/read`
   - Marks messages as seen in DB
   - Emits `message:seen` (seq: 3)

4. **Offline-to-Online Delivery**: `server.js` (lines 354-428)
   - Processes undelivered messages when user comes online
   - Emits `message:delivered` for offline messages

---

### **Client-Side**

1. **Status Update Handlers**: `client/src/pages/Messages.tsx`
   - `onMessageSent` (lines 366-508) - Handles "Sent" status
   - `onMessageDelivered` (lines 510-608) - Handles "Delivered" status
   - `onMessageSeen` (lines 967-1083) - Handles "Read" status

2. **Status Tracking**: `client/src/pages/Messages.tsx`
   - `messageStatus` state - Internal tracking
   - `renderedStatus` state - UI display
   - `messageSeqRef` - Sequence number tracking
   - `bufferedStatusRef` - Buffered updates
   - `highestStatusRef` - Highest status tracking

3. **Status Rendering**: `client/src/pages/Messages.tsx` (lines 2138-2210)
   - `getHighestStatus` - Finds highest status across all sources
   - `getStatusPriority` - Gets status priority
   - Status display logic - Determines what to show

4. **Unified Dispatcher**: `client/src/services/NotificationDispatcher.ts`
   - Buffers and coalesces status updates
   - Dispatches to UI after buffer delay
   - Handles deduplication and metrics

5. **Initial Status Load**: `client/src/pages/Messages.tsx` (lines 1516-1715)
   - `fetchMessages` - Loads messages from DB
   - Sets initial status based on `deliveredTo` and `seenBy` arrays

---

## ✅ Verification Checklist

To verify that the UI only shows the correct status at the correct time:

1. **✅ Sequence Number Validation**
   - Older events (lower seq) are ignored
   - Out-of-order events are rejected

2. **✅ Priority Enforcement**
   - Backward transitions are prevented
   - Only higher priority statuses are accepted

3. **✅ Highest Status Tracking**
   - Checks all sources (renderedStatus, messageStatus, bufferedStatusRef, message object)
   - Always shows the highest available status

4. **✅ Buffering and Coalescing**
   - Rapid transitions are buffered (100ms)
   - Intermediate statuses are skipped
   - Only final state is rendered

5. **✅ Read Status Immediate**
   - Read status bypasses all buffers
   - Applied immediately with `flushSync`
   - Sound plays immediately

6. **✅ Sound Playback**
   - Sent sound plays only on "Sent" transition
   - Read sound plays only on "Read" transition
   - No sound on "Delivered" or `fetchMessages()`

7. **✅ Initial Load**
   - `fetchMessages()` sets status from DB (`deliveredTo`, `seenBy`)
   - No sound on initial load
   - Status matches server state

---

## 🎯 Summary

The message status flow ensures:
1. **Correct Sequence**: Status progresses forward only (In progress → Sent → Delivered → Read)
2. **No Backward Transitions**: Sequence numbers and priority checks prevent backward moves
3. **Optimal UI**: Only shows the highest available status, skipping intermediate states
4. **Realtime Updates**: Handles out-of-order events, deduplication, and outdated events
5. **Immediate Read**: Read status is applied immediately (no buffering)
6. **Sound Synchronization**: Sounds play at the correct times (Sent, Read) and are synchronized with status updates

The system is designed to be robust against race conditions, network delays, and out-of-order events, ensuring the UI always displays the correct status at the correct time.

