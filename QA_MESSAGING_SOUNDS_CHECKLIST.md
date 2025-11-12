# QA Checklist: Messaging Sounds Implementation

## 🎯 Key Requirements to Verify

### ✅ **Requirement 1**: `message_sent.mp3` plays exactly once when message status transitions to "Sent"
- [ ] Sound plays when status changes from "In progress..." → "Sent"
- [ ] Sound plays even if `message:delivered` arrived earlier (race condition)
- [ ] Sound plays exactly once per message
- [ ] No replay on subsequent status updates

### ✅ **Requirement 2**: No play on "Delivered" (unless fallback required)
- [ ] Sound does NOT play when status changes to "Delivered"
- [ ] Sound only plays on "Sent" status transition
- [ ] Fallback only if `message:sent` never arrives (edge case)

### ✅ **Requirement 3**: `sentSoundPlayed` prevents replays (per-message)
- [ ] Each messageId is tracked in `sentSoundPlayedRef`
- [ ] Sound doesn't replay for the same messageId
- [ ] Set persists across component re-renders
- [ ] Set is keyed by `messageId` (unique per message)

### ✅ **Requirement 4**: Preloading works and audio.play() promise rejections are logged
- [ ] Audio files are preloaded on module load
- [ ] Preload logs appear in console: `[ChatSounds] ✅ Preloaded {soundType} sound`
- [ ] Audio.play() promise rejections are caught and logged
- [ ] Errors are handled gracefully (no crashes)

### ✅ **Requirement 5**: iOS Safari and multi-tab behavior
- [ ] Sounds work on iOS Safari (with user interaction)
- [ ] Multi-tab: sounds only play in active tab
- [ ] Multi-tab: status updates sync across tabs
- [ ] Multi-tab: sounds don't replay when switching tabs

---

## 📋 Testing Scenarios

### **Scenario 1: Normal Send (Recipient Offline)**

**Steps**:
1. Open conversation with recipient (recipient is offline)
2. Send a message
3. Observe console logs and sound playback

**Expected Behavior**:
- ✅ `message:sent` event received
- ✅ Status transitions: "In progress..." → "Sent"
- ✅ `message_sent.mp3` plays once
- ✅ Status later transitions to "Delivered" (when recipient comes online)
- ✅ No sound plays on "Delivered"

**Expected Console Logs**:
```
[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at <timestamp>
[Messages] 📨 message:sent event received at <timestamp>: { conversationId, messageId }
[Messages] Status transition check: {
  messageId: "<messageId>",
  prevStatus: "In progress...",
  newStatus: "Sent",
  isTransitionToSent: true,
  isDeliveredButSoundNotPlayed: false,
  soundNotPlayed: true,
  shouldPlaySound: true,
  timestamp: "<timestamp>"
}
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at <timestamp>: <messageId>
[ChatSounds] 🔊 Playing sent sound
```

**Verification**:
- [ ] Sound plays exactly once
- [ ] Console shows `isTransitionToSent: true`
- [ ] Console shows `shouldPlaySound: true`
- [ ] Sound plays immediately (no delay)

---

### **Scenario 2: Race Condition (Recipient Online - Delivered Before Sent)**

**Steps**:
1. Open conversation with recipient (recipient is online)
2. Send a message quickly
3. Observe console logs and sound playback

**Expected Behavior**:
- ⚠️ `message:delivered` may arrive before `message:sent` (race condition)
- ✅ Status transitions: "In progress..." → "Delivered" (if delivered arrives first)
- ✅ When `message:sent` arrives, status is already "Delivered"
- ✅ Sound still plays (race condition handling)
- ✅ Sound plays exactly once

**Expected Console Logs**:
```
[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at <timestamp1>
ACK received → emitting message:delivered at <timestamp2>
[Messages] 📬 message:delivered event received at <timestamp2>: { conversationId, messageId }
[Messages] Status transition: {
  messageId: "<messageId>",
  prevStatus: "In progress...",
  newStatus: "Delivered",
  timestamp: "<timestamp2>",
  soundPlayed: false
}
[Messages] ⚠️ WARNING: message:delivered arrived before message:sent for: <messageId>
[Messages] ⚠️ Sound will NOT play on delivered - it will only play when message:sent arrives and transitions to "Sent"

[Messages] 📨 message:sent event received at <timestamp3>: { conversationId, messageId }
[Messages] Status transition check: {
  messageId: "<messageId>",
  prevStatus: "Delivered",
  newStatus: "Sent",
  isTransitionToSent: false,
  isDeliveredButSoundNotPlayed: true,
  soundNotPlayed: true,
  shouldPlaySound: true,
  timestamp: "<timestamp3>"
}
[Messages] 🔊 Playing sent sound (status transition: race condition (Delivered → Sent)) at <timestamp3>: <messageId>
[ChatSounds] 🔊 Playing sent sound
```

**Verification**:
- [ ] `message:delivered` arrives before `message:sent` (check timestamps)
- [ ] Warning log appears: "message:delivered arrived before message:sent"
- [ ] Sound plays when `message:sent` arrives (even though status is "Delivered")
- [ ] Console shows `isDeliveredButSoundNotPlayed: true`
- [ ] Console shows `shouldPlaySound: true`
- [ ] Sound plays exactly once

---

### **Scenario 3: Already Played (Prevents Replay)**

**Steps**:
1. Send a message (sound plays)
2. Trigger status update again (e.g., fetchMessages, reconnect)
3. Observe console logs

**Expected Behavior**:
- ✅ Sound does NOT replay
- ✅ Console shows "Skipping sent sound - already played"
- ✅ `sentSoundPlayedRef` prevents replay

**Expected Console Logs**:
```
[Messages] 📨 message:sent event received at <timestamp>: { conversationId, messageId }
[Messages] Status transition check: {
  messageId: "<messageId>",
  prevStatus: "Sent",
  newStatus: "Sent",
  isTransitionToSent: false,
  isDeliveredButSoundNotPlayed: false,
  soundNotPlayed: false,
  shouldPlaySound: false,
  timestamp: "<timestamp>"
}
[Messages] ⚠️ Skipping sent sound - already played: {
  messageId: "<messageId>",
  prevStatus: "Sent"
}
```

**Verification**:
- [ ] Sound does NOT play
- [ ] Console shows `soundNotPlayed: false`
- [ ] Console shows `shouldPlaySound: false`
- [ ] Console shows "Skipping sent sound - already played"

---

### **Scenario 4: fetchMessages Path (Status from Server Data)**

**Steps**:
1. Send a message (while viewing conversation)
2. Navigate away and back to conversation
3. `fetchMessages()` runs and updates status from server
4. Observe console logs

**Expected Behavior**:
- ✅ Status updates from server data (may skip "Sent" → "Delivered")
- ✅ Sound does NOT play (should have already played on `message:sent`)
- ✅ Console logs status update from `fetchMessages`

**Expected Console Logs**:
```
[Messages] Status update from fetchMessages: {
  messageId: "<messageId>",
  prevStatus: "Sent",
  newStatus: "Delivered",
  source: "fetchMessages",
  timestamp: "<timestamp>"
}
```

**Verification**:
- [ ] Status updates correctly from server data
- [ ] Sound does NOT play (already played on `message:sent`)
- [ ] Console shows status update from `fetchMessages`

---

### **Scenario 5: Preloading Verification**

**Steps**:
1. Open browser console
2. Load the Messages page
3. Check for preload logs

**Expected Behavior**:
- ✅ Preload logs appear on module load
- ✅ All 4 sounds are preloaded
- ✅ No errors during preload

**Expected Console Logs**:
```
[ChatSounds] ✅ Preloaded sent sound: /sounds/message_sent.mp3
[ChatSounds] ✅ Preloaded received sound: /sounds/message_received.mp3
[ChatSounds] ✅ Preloaded typing sound: /sounds/typing.mp3
[ChatSounds] ✅ Preloaded read sound: /sounds/message_read.mp3
```

**Verification**:
- [ ] All 4 preload logs appear
- [ ] No preload errors
- [ ] Sounds play immediately (no loading delay)

---

### **Scenario 6: Audio.play() Promise Rejection**

**Steps**:
1. Disable autoplay in browser settings (Chrome: chrome://settings/content/sound)
2. Send a message
3. Observe console logs

**Expected Behavior**:
- ⚠️ Audio.play() promise may be rejected (autoplay blocked)
- ✅ Error is caught and logged
- ✅ No crash or unhandled rejection
- ✅ Sound unlocks on next user interaction

**Expected Console Logs**:
```
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at <timestamp>: <messageId>
[ChatSounds] ⚠️ Could not play sent sound (autoplay may be blocked): <error>
```

**Verification**:
- [ ] Promise rejection is caught
- [ ] Warning log appears
- [ ] No unhandled promise rejection
- [ ] No crash

---

### **Scenario 7: iOS Safari Behavior**

**Steps**:
1. Open Messages page on iOS Safari
2. Send a message (with user interaction)
3. Observe behavior

**Expected Behavior**:
- ✅ Sounds work after user interaction (tap, click)
- ✅ Audio unlocks on first interaction
- ✅ Sounds play correctly
- ⚠️ May require user interaction due to iOS autoplay policy

**Verification**:
- [ ] Sounds work on iOS Safari
- [ ] Audio unlocks on user interaction
- [ ] No errors related to autoplay
- [ ] Sounds play after interaction

---

### **Scenario 8: Multi-Tab Behavior**

**Steps**:
1. Open Messages page in Tab 1
2. Open same conversation in Tab 2
3. Send a message from Tab 1
4. Observe behavior in both tabs

**Expected Behavior**:
- ✅ Sound plays only in active tab (Tab 1)
- ✅ Status updates in both tabs
- ✅ Sound does NOT play in inactive tab (Tab 2)
- ✅ When switching to Tab 2, sound does NOT replay

**Expected Console Logs (Tab 1 - Active)**:
```
[Messages] 📨 message:sent event received at <timestamp>: { conversationId, messageId }
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at <timestamp>: <messageId>
[ChatSounds] 🔊 Playing sent sound
```

**Expected Console Logs (Tab 2 - Inactive)**:
```
[Messages] 📨 message:sent event received at <timestamp>: { conversationId, messageId }
[Messages] Status transition check: {
  messageId: "<messageId>",
  prevStatus: "In progress...",
  newStatus: "Sent",
  isTransitionToSent: true,
  soundNotPlayed: true,
  shouldPlaySound: true,
  timestamp: "<timestamp>"
}
[Messages] ⚠️ Sent sound NOT played (conditions not met): {
  messageId: "<messageId>",
  isCurrentConversation: true,
  isTabVisible: false,  // ← Tab is hidden
  activeConversationId: "<conversationId>"
}
```

**Verification**:
- [ ] Sound plays only in active tab
- [ ] Console shows `isTabVisible: false` in inactive tab
- [ ] Status updates in both tabs
- [ ] Sound does NOT replay when switching tabs

---

## 🔍 Console Log Snippets

### **Normal Send (Recipient Offline)**

```javascript
// Server emits message:sent
[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at 2024-01-15T10:30:45.123Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  senderId: "user_abc123",
  timestamp: "2024-01-15T10:30:45.123Z"
}

// Client receives message:sent
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.125Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// Status transition check
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

// Sound plays
[Messages] 🔊 Playing sent sound (status transition: In progress... → Sent) at 2024-01-15T10:30:45.126Z: msg_123456789
[ChatSounds] 🔊 Playing sent sound

// Later: message:delivered arrives
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
```

### **Race Condition (Recipient Online - Delivered Before Sent)**

```javascript
// Server emits message:sent
[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at 2024-01-15T10:30:45.123Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  senderId: "user_abc123",
  timestamp: "2024-01-15T10:30:45.123Z"
}

// Recipient ACKs immediately (online)
ACK received → emitting message:delivered at 2024-01-15T10:30:45.124Z : {
  conversationId: "67890abcdef",
  messageId: "msg_123456789",
  targetRoom: "user:user_abc123",
  senderId: "user_abc123"
}

// message:delivered arrives FIRST (race condition)
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

// message:sent arrives AFTER delivered
[Messages] 📨 message:sent event received at 2024-01-15T10:30:45.127Z: {
  conversationId: "67890abcdef",
  messageId: "msg_123456789"
}

// Status transition check (handles race condition)
[Messages] Status transition check: {
  messageId: "msg_123456789",
  prevStatus: "Delivered",  // ← Status is already "Delivered"
  newStatus: "Sent",
  isTransitionToSent: false,
  isDeliveredButSoundNotPlayed: true,  // ← Race condition detected
  soundNotPlayed: true,
  shouldPlaySound: true,  // ← Sound will still play
  timestamp: "2024-01-15T10:30:45.127Z"
}

// Sound plays (race condition handling)
[Messages] 🔊 Playing sent sound (status transition: race condition (Delivered → Sent)) at 2024-01-15T10:30:45.128Z: msg_123456789
[ChatSounds] 🔊 Playing sent sound
```

### **fetchMessages Path (Status from Server Data)**

```javascript
// fetchMessages() runs and updates status from server
[Messages] Status update from fetchMessages: {
  messageId: "msg_123456789",
  prevStatus: "Sent",
  newStatus: "Delivered",
  source: "fetchMessages",
  timestamp: "2024-01-15T10:30:47.500Z"
}

// Note: Sound does NOT play here (already played on message:sent)
// This is just a status update from server data
```

---

## ✅ Verification Checklist

### **Functionality**
- [ ] Sound plays exactly once when status transitions to "Sent"
- [ ] Sound does NOT play on "Delivered" status
- [ ] Race condition handled (sound plays even if delivered arrives first)
- [ ] Replay prevented (sound doesn't play twice for same message)
- [ ] Preloading works (sounds are preloaded on module load)
- [ ] Promise rejections are caught and logged
- [ ] No crashes or unhandled errors

### **Console Logs**
- [ ] Timestamps show correct event order
- [ ] Status transitions are logged correctly
- [ ] Race condition warnings appear when needed
- [ ] Preload logs appear on module load
- [ ] Error logs appear for promise rejections

### **Platforms**
- [ ] Works on Chrome/Edge (Windows/Mac)
- [ ] Works on Firefox (Windows/Mac)
- [ ] Works on Safari (Mac)
- [ ] Works on iOS Safari (with user interaction)
- [ ] Works on Android Chrome

### **Multi-Tab**
- [ ] Sound plays only in active tab
- [ ] Status updates sync across tabs
- [ ] Sound doesn't replay when switching tabs
- [ ] Console shows `isTabVisible: false` in inactive tab

---

## 🐛 Known Issues & Edge Cases

### **Issue 1: Component Remount Resets Set**
- **Problem**: If component unmounts and remounts, `sentSoundPlayedRef` is reset
- **Impact**: Sound may replay if user navigates away and back
- **Acceptable**: New mount = new session, replay is acceptable

### **Issue 2: iOS Safari Autoplay Policy**
- **Problem**: iOS Safari blocks autoplay without user interaction
- **Impact**: Sounds may not play until user interacts
- **Solution**: Audio unlocks on first user interaction

### **Issue 3: Network Latency**
- **Problem**: Network delays can cause events to arrive out of order
- **Impact**: Race condition where delivered arrives before sent
- **Solution**: Race condition handling ensures sound still plays

---

## 📝 Test Results Template

```
Date: _______________
Tester: _______________
Browser: _______________
OS: _______________

Scenario 1: Normal Send
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 2: Race Condition
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 3: Already Played
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 4: fetchMessages Path
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 5: Preloading
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 6: Promise Rejection
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 7: iOS Safari
- [ ] Pass
- [ ] Fail
- Notes: _______________

Scenario 8: Multi-Tab
- [ ] Pass
- [ ] Fail
- Notes: _______________
```

---

## 🚀 Deployment Notes

### **Before Deployment**
- [ ] All code changes reviewed
- [ ] Console logs added for debugging
- [ ] Preloading implemented
- [ ] Promise rejection handling verified
- [ ] Race condition handling tested

### **After Deployment**
- [ ] Monitor console logs for errors
- [ ] Check preload logs on page load
- [ ] Verify sound playback timing
- [ ] Test on multiple browsers
- [ ] Test on iOS Safari
- [ ] Test multi-tab scenarios

---

## 📞 Support

If issues are found:
1. Check console logs for error messages
2. Verify preload logs appear
3. Check event timestamps for race conditions
4. Verify `sentSoundPlayedRef` is working correctly
5. Test on different browsers/platforms

