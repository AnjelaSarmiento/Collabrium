# Expected Console Logs - Messaging Sounds

## 📋 Console Log Snippets for QA Verification

### **1. Normal Send (Recipient Offline)**

**Timeline**: Sent → Delivered (later when recipient comes online)

```javascript
// ========================================
// STEP 1: Server emits message:sent
// ========================================
[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at 2024-01-15T10:30:45.123Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  senderId: "user_abc123",
  timestamp: "2024-01-15T10:30:45.123Z"
}

// ========================================
// STEP 2: Client receives message:sent
// ========================================
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.125Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// ========================================
// STEP 3: Status transition check
// ========================================
[Messages] Status transition check: {
  messageId: "msg_123456789",
  prevStatus: "In progress...",
  newStatus: "Sent",
  isTransitionToSent: true,
  isDeliveredButSoundNotPlayed: false,
  soundNotPlayed: true,
  shouldPlaySound: true,
  timestamp: "2024-01-15T10:30:45.125Z"
}

// ========================================
// STEP 4: Sound plays
// ========================================
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at 2024-01-15T10:30:45.126Z: msg_123456789
[ChatSounds] 🔊 Playing sent sound

// ========================================
// STEP 5: Later - message:delivered arrives (when recipient comes online)
// ========================================
ACK received → emitting message:delivered at 2024-01-15T10:30:46.234Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  targetRoom: "user:user_abc123",
  senderId: "user_abc123"
}

[Messages] 📬 message:delivered event received at 2024-01-15T10:30:46.236Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

[Messages] Status transition: {
  messageId: "msg_123456789",
  prevStatus: "Sent",
  newStatus: "Delivered",
  timestamp: "2024-01-15T10:30:46.236Z",
  soundPlayed: true
}

// ✅ VERIFICATION:
// - message:sent arrives first (timestamp: 10:30:45.125)
// - Sound plays on "Sent" status
// - message:delivered arrives later (timestamp: 10:30:46.236)
// - No sound plays on "Delivered"
```

---

### **2. Race Condition (Recipient Online - Delivered Before Sent)**

**Timeline**: Delivered → Sent (events arrive out of order)

```javascript
// ========================================
// STEP 1: Server emits message:sent
// ========================================
[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at 2024-01-15T10:30:45.123Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  senderId: "user_abc123",
  timestamp: "2024-01-15T10:30:45.123Z"
}

// ========================================
// STEP 2: Recipient ACKs immediately (online) - message:delivered arrives FIRST
// ========================================
ACK received → emitting message:delivered at 2024-01-15T10:30:45.124Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  targetRoom: "user:user_abc123",
  senderId: "user_abc123"
}

[Messages] 📬 message:delivered event received at 2024-01-15T10:30:45.125Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

[Messages] Status transition: {
  messageId: "msg_123456789",
  prevStatus: "In progress...",
  newStatus: "Delivered",
  timestamp: "2024-01-15T10:30:45.125Z",
  soundPlayed: false
}

[Messages] ⚠️ WARNING: message:delivered arrived before message:sent for: msg_123456789
[Messages] ⚠️ Sound will NOT play on delivered - it will only play when message:sent arrives and transitions to "Sent"

// ========================================
// STEP 3: message:sent arrives AFTER delivered (race condition)
// ========================================
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.127Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// ========================================
// STEP 4: Status transition check (race condition handling)
// ========================================
[Messages] Status transition check: {
  messageId: "msg_123456789",
  prevStatus: "Delivered",  // ← Status is already "Delivered" (race condition)
  newStatus: "Sent",
  isTransitionToSent: false,  // ← Not a normal transition
  isDeliveredButSoundNotPlayed: true,  // ← Race condition detected
  soundNotPlayed: true,
  shouldPlaySound: true,  // ← Sound will still play
  timestamp: "2024-01-15T10:30:45.127Z"
}

// ========================================
// STEP 5: Sound plays (race condition handling)
// ========================================
[Messages] 🔊 Playing sent sound (status transition: race condition (Delivered → Sent)) at 2024-01-15T10:30:45.128Z: msg_123456789
[ChatSounds] 🔊 Playing sent sound

// ✅ VERIFICATION:
// - message:delivered arrives first (timestamp: 10:30:45.125)
// - message:sent arrives after (timestamp: 10:30:45.127)
// - Race condition detected: isDeliveredButSoundNotPlayed: true
// - Sound still plays (race condition handling)
// - Sound plays exactly once
```

---

### **3. Already Played (Prevents Replay)**

**Timeline**: Sound already played, prevent replay

```javascript
// ========================================
// STEP 1: message:sent event received (sound already played)
// ========================================
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.125Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// ========================================
// STEP 2: Status transition check (sound already played)
// ========================================
[Messages] Status transition check: {
  messageId: "msg_123456789",
  prevStatus: "Sent",
  newStatus: "Sent",
  isTransitionToSent: false,
  isDeliveredButSoundNotPlayed: false,
  soundNotPlayed: false,  // ← Sound already played
  shouldPlaySound: false,  // ← Will not play
  timestamp: "2024-01-15T10:30:45.125Z"
}

// ========================================
// STEP 3: Sound skipped (already played)
// ========================================
[Messages] ⚠️ Skipping sent sound - already played: {
  messageId: "msg_123456789",
  prevStatus: "Sent"
}

// ✅ VERIFICATION:
// - soundNotPlayed: false (sound already played)
// - shouldPlaySound: false (will not play)
// - Console shows "Skipping sent sound - already played"
// - No sound plays
```

---

### **4. fetchMessages Path (Status from Server Data)**

**Timeline**: Status update from server (no event)

```javascript
// ========================================
// STEP 1: fetchMessages() runs and updates status from server
// ========================================
[Messages] Status update from fetchMessages: {
  messageId: "msg_123456789",
  prevStatus: "Sent",
  newStatus: "Delivered",
  source: "fetchMessages",
  timestamp: "2024-01-15T10:30:47.500Z"
}

// ✅ VERIFICATION:
// - Status updates from server data
// - No sound plays (already played on message:sent)
// - Console shows status update from fetchMessages
// - Source: "fetchMessages"
```

---

### **5. Preloading Verification**

**Timeline**: Module load (page load)

```javascript
// ========================================
// STEP 1: Module loads, preloads audio files
// ========================================
[ChatSounds] ✅ Preloaded sent sound: /sounds/message_sent.mp3
[ChatSounds] ✅ Preloaded received sound: /sounds/message_received.mp3
[ChatSounds] ✅ Preloaded typing sound: /sounds/typing.mp3
[ChatSounds] ✅ Preloaded read sound: /sounds/message_read.mp3

// ✅ VERIFICATION:
// - All 4 preload logs appear
// - No preload errors
// - Sounds are ready for immediate playback
```

---

### **6. Audio.play() Promise Rejection**

**Timeline**: Autoplay blocked

```javascript
// ========================================
// STEP 1: Sound play attempted
// ========================================
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at 2024-01-15T10:30:45.126Z: msg_123456789

// ========================================
// STEP 2: Promise rejection (autoplay blocked)
// ========================================
[ChatSounds] ⚠️ Could not play sent sound (autoplay may be blocked): NotAllowedError: play() failed because the user didn't interact with the document first.

// ✅ VERIFICATION:
// - Promise rejection is caught
// - Warning log appears
// - No unhandled promise rejection
// - No crash
```

---

### **7. Multi-Tab Behavior (Active Tab)**

**Timeline**: Sound plays in active tab

```javascript
// ========================================
// STEP 1: message:sent event received (active tab)
// ========================================
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.125Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// ========================================
// STEP 2: Status transition check (tab visible)
// ========================================
[Messages] Status transition check: {
  messageId: "msg_123456789",
  prevStatus: "In progress...",
  newStatus: "Sent",
  isTransitionToSent: true,
  soundNotPlayed: true,
  shouldPlaySound: true,
  timestamp: "2024-01-15T10:30:45.125Z"
}

// ========================================
// STEP 3: Sound plays (tab is visible)
// ========================================
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at 2024-01-15T10:30:45.126Z: msg_123456789
[ChatSounds] 🔊 Playing sent sound

// ✅ VERIFICATION:
// - Sound plays in active tab
// - Tab is visible (document.visibilityState === 'visible')
// - Sound plays immediately
```

---

### **8. Multi-Tab Behavior (Inactive Tab)**

**Timeline**: Sound does NOT play in inactive tab

```javascript
// ========================================
// STEP 1: message:sent event received (inactive tab)
// ========================================
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.125Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// ========================================
// STEP 2: Status transition check (tab hidden)
// ========================================
[Messages] Status transition check: {
  messageId: "msg_123456789",
  prevStatus: "In progress...",
  newStatus: "Sent",
  isTransitionToSent: true,
  soundNotPlayed: true,
  shouldPlaySound: true,
  timestamp: "2024-01-15T10:30:45.125Z"
}

// ========================================
// STEP 3: Sound NOT played (tab is hidden)
// ========================================
[Messages] ⚠️ Sent sound NOT played (conditions not met): {
  messageId: "msg_123456789",
  shouldPlaySound: true,
  isCurrentConversation: true,
  isTabVisible: false,  // ← Tab is hidden
  activeConversationId: "67890abcdef"
}

// ✅ VERIFICATION:
// - Sound does NOT play in inactive tab
// - isTabVisible: false
// - Status still updates
// - Sound does NOT replay when switching to this tab
```

---

## 📊 Timestamp Verification

### **Normal Send**
- `message:sent` emitted: `10:30:45.123Z`
- `message:sent` received: `10:30:45.125Z` (2ms delay)
- Sound plays: `10:30:45.126Z` (1ms after receipt)
- `message:delivered` received: `10:30:46.236Z` (1.1s later)

### **Race Condition**
- `message:sent` emitted: `10:30:45.123Z`
- `message:delivered` received: `10:30:45.125Z` (2ms delay)
- `message:sent` received: `10:30:45.127Z` (4ms delay, after delivered)
- Sound plays: `10:30:45.128Z` (1ms after sent receipt)

**Key Points**:
- ✅ Events can arrive out of order (network timing)
- ✅ Race condition is detected and handled
- ✅ Sound still plays even if delivered arrives first
- ✅ Timestamps show correct event order

---

## 🔍 Key Verification Points

### **1. Sound Plays Exactly Once**
- ✅ Check `soundNotPlayed: true` before playing
- ✅ Check `shouldPlaySound: true` before playing
- ✅ Check `sentSoundPlayedRef` is updated after playing
- ✅ Check "Skipping sent sound - already played" on replay

### **2. Race Condition Handling**
- ✅ Check `isDeliveredButSoundNotPlayed: true` when delivered arrives first
- ✅ Check `shouldPlaySound: true` even if status is "Delivered"
- ✅ Check "race condition (Delivered → Sent)" in log
- ✅ Check sound still plays

### **3. No Play on Delivered**
- ✅ Check sound does NOT play on `message:delivered` event
- ✅ Check warning log if delivered arrives before sent
- ✅ Check sound only plays on `message:sent` event

### **4. Preloading**
- ✅ Check preload logs appear on module load
- ✅ Check all 4 sounds are preloaded
- ✅ Check no preload errors

### **5. Promise Rejection**
- ✅ Check promise rejection is caught
- ✅ Check warning log appears
- ✅ Check no unhandled rejection
- ✅ Check no crash

---

## 📝 Notes for QA

1. **Timestamps**: Check event timestamps to verify order
2. **Status Transitions**: Verify status changes correctly
3. **Sound Playback**: Verify sound plays exactly once
4. **Race Conditions**: Verify race condition handling works
5. **Multi-Tab**: Verify sound plays only in active tab
6. **iOS Safari**: Verify sounds work after user interaction
7. **Preloading**: Verify preload logs appear on page load
8. **Error Handling**: Verify promise rejections are handled

