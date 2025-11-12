# Bug Fix: message_sent.mp3 Plays on "Delivered" Instead of "Sent"

## 🐛 Issue Description

**Problem**: `message_sent.mp3` sometimes plays on "Delivered" instead of "Sent" when recipient is online.

**Scenarios Affected**:
- Recipient is online but not viewing the conversation
- Recipient is online and viewing the conversation

**Root Cause**: When recipient is online, they ACK immediately, causing `message:delivered` to arrive before or at the same time as `message:sent`. The timing of `fetchMessages()` call from `onMessageDelivered` can interfere with sound playback.

---

## 🔧 Fixes Applied

### **Fix 1: Mark Sound as Played IMMEDIATELY**

**Problem**: Sound was being marked as played after status update, allowing race conditions.

**Solution**: Mark sound as played IMMEDIATELY when we decide to play it, before any status updates or async operations.

**Code Change** (`client/src/pages/Messages.tsx` lines 309-313):
```typescript
// Mark sound as played IMMEDIATELY if we're going to play it
// This prevents any race conditions with fetchMessages() or other async operations
if (shouldPlaySound) {
  sentSoundPlayedRef.current.add(payload.messageId);
}
```

**Benefit**: Prevents `fetchMessages()` from interfering with sound playback timing.

---

### **Fix 2: Play Sound IMMEDIATELY (Before Async Operations)**

**Problem**: Sound was being played after status update, which could be delayed by async operations.

**Solution**: Play sound IMMEDIATELY when `message:sent` arrives, before any async operations like `fetchMessages()`.

**Code Change** (`client/src/pages/Messages.tsx` lines 340-358):
```typescript
// Play message sent sound IMMEDIATELY if conditions are met
// CRITICAL: Play sound BEFORE any async operations (like fetchMessages) can interfere
// This ensures sound plays on "Sent" regardless of recipient online state
if (shouldPlaySound) {
  // ... play sound immediately ...
  playMessageSent();
}
```

**Benefit**: Sound plays immediately when `message:sent` arrives, regardless of recipient state.

---

### **Fix 3: Increase fetchMessages Delay**

**Problem**: `fetchMessages()` was called too quickly (100ms) after `message:delivered`, potentially interfering with `message:sent` handler.

**Solution**: Increase delay to 200ms to give `message:sent` handler time to complete.

**Code Change** (`client/src/pages/Messages.tsx` line 432):
```typescript
setTimeout(() => {
  if (selectedConversationIdRef.current === payload.conversationId) {
    fetchMessages(payload.conversationId);
  }
}, 200); // Increased from 100ms to 200ms to give message:sent handler time to complete
```

**Benefit**: Ensures `message:sent` handler completes before `fetchMessages()` runs.

---

### **Fix 4: Enhanced Logging in fetchMessages**

**Problem**: No visibility into whether sound was already played when `fetchMessages()` updates status.

**Solution**: Add logging to track sound state during `fetchMessages()` status updates.

**Code Change** (`client/src/pages/Messages.tsx` lines 819-830):
```typescript
const soundAlreadyPlayed = sentSoundPlayedRef.current.has(msg._id);
console.log('[Messages] Status update from fetchMessages:', {
  messageId: msg._id,
  prevStatus: currentStatus,
  newStatus,
  source: 'fetchMessages',
  soundAlreadyPlayed, // Log whether sound was already played
  timestamp: new Date().toISOString()
});

if ((newStatus === 'Delivered' || newStatus === 'Read') && !soundAlreadyPlayed) {
  console.log('[Messages] ⚠️ Status updated to', newStatus, 'but sound not played yet - waiting for message:sent event');
}
```

**Benefit**: Better debugging visibility into sound state during status updates.

---

## ✅ Expected Behavior After Fix

### **When Recipient is Online**

**Timeline**:
1. Sender sends message
2. Server emits `message:sent` → sender receives it
3. Sound plays IMMEDIATELY (status = "Sent")
4. Server emits `message:new` → recipient receives it
5. Recipient ACKs immediately → server emits `message:delivered`
6. Sender receives `message:delivered` → status = "Delivered" (NO sound)
7. `fetchMessages()` runs after 200ms delay (NO sound)

**Result**: ✅ Sound plays on "Sent", NOT on "Delivered"

---

### **Race Condition (Delivered Before Sent)**

**Timeline**:
1. Sender sends message
2. Server emits `message:sent` (may arrive later)
3. Server emits `message:new` → recipient ACKs immediately
4. Server emits `message:delivered` → sender receives it FIRST
5. Status = "Delivered" (NO sound)
6. `message:sent` arrives → detects race condition
7. Sound plays IMMEDIATELY (status already "Delivered", but sound plays)

**Result**: ✅ Sound plays when `message:sent` arrives, even if delivered arrived first

---

## 🔍 Verification

### **Check Console Logs**

**Normal Flow (Recipient Online)**:
```
[Messages] 📨 message:sent event received at <timestamp>
[Messages] Status transition check: { prevStatus: "In progress...", shouldPlaySound: true }
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent)
[Messages] ✅ Sound marked as played IMMEDIATELY to prevent replay

[Messages] 📬 message:delivered event received at <timestamp>
[Messages] Status transition: { prevStatus: "Sent", newStatus: "Delivered", soundPlayed: true }
```

**Race Condition (Delivered Before Sent)**:
```
[Messages] 📬 message:delivered event received at <timestamp1>
[Messages] Status transition: { prevStatus: "In progress...", newStatus: "Delivered", soundPlayed: false }
[Messages] ⚠️ WARNING: message:delivered arrived before message:sent

[Messages] 📨 message:sent event received at <timestamp2>
[Messages] Status transition check: { prevStatus: "Delivered", isDeliveredButSoundNotPlayed: true, shouldPlaySound: true }
[Messages] 🔊 Playing sent sound (status transition: race condition (Delivered → Sent))
[Messages] ✅ Sound marked as played IMMEDIATELY to prevent replay
```

---

## 📝 Testing Checklist

- [ ] Send message when recipient is online (not viewing conversation)
  - [ ] Sound plays on "Sent"
  - [ ] NO sound on "Delivered"
  - [ ] Console shows sound played on message:sent event

- [ ] Send message when recipient is online (viewing conversation)
  - [ ] Sound plays on "Sent"
  - [ ] NO sound on "Delivered"
  - [ ] Console shows sound played on message:sent event

- [ ] Race condition (delivered before sent)
  - [ ] Warning log appears
  - [ ] Sound plays when sent arrives
  - [ ] NO sound on delivered event

- [ ] Verify fetchMessages doesn't trigger sound
  - [ ] Status updates from fetchMessages
  - [ ] NO sound plays
  - [ ] Console shows "waiting for message:sent event" if sound not played

---

## 🎯 Summary

**Fixes Applied**:
1. ✅ Mark sound as played IMMEDIATELY (before async operations)
2. ✅ Play sound IMMEDIATELY (before fetchMessages can interfere)
3. ✅ Increase fetchMessages delay (200ms instead of 100ms)
4. ✅ Enhanced logging for debugging

**Expected Result**:
- ✅ Sound plays exactly once on "Sent" status
- ✅ Sound does NOT play on "Delivered" status
- ✅ Works correctly regardless of recipient online state
- ✅ Race condition handled correctly

