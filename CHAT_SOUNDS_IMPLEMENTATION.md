# Chat Sounds Implementation

## Overview
Chat sounds have been implemented for the Messages feature with the following behaviors:

## Sound Files Required

Place the following MP3 files in `client/public/sounds/`:

### Required Files:
1. **`message_sent.mp3`** - Plays when sender sends a message while viewing the conversation
2. **`message_received.mp3`** - Plays when recipient receives a message while viewing the conversation

### Optional Files:
3. **`typing.mp3`** - Plays when other participant is typing (optional)
4. **`message_read.mp3`** - Plays when recipient reads sender's message (optional)

## File Locations

```
client/public/sounds/
├── message_sent.mp3      (Required)
├── message_received.mp3  (Required)
├── typing.mp3            (Optional)
└── message_read.mp3      (Optional)
```

These files are accessible at:
- `/sounds/message_sent.mp3`
- `/sounds/message_received.mp3`
- `/sounds/typing.mp3`
- `/sounds/message_read.mp3`

## Implementation Details

### 1. Message Sent Sound (Sender-only)
- **Trigger**: When sender successfully sends a message
- **Conditions**:
  - User is viewing the conversation (`window.__activeConversationId` matches)
  - Tab is visible (`document.visibilityState === 'visible'`)
- **Location**: `client/src/pages/Messages.tsx` → `sendMessage()` function
- **Note**: Currently plays when sender is viewing the conversation. If you need to check if recipient is also viewing (server-side check), we can add that logic.

### 2. Message Received Sound (Recipient-only)
- **Trigger**: When recipient receives a new message
- **Conditions**:
  - Message is from another user (not self)
  - User is viewing the conversation (`window.__activeConversationId` matches)
  - Tab is visible (`document.visibilityState === 'visible'`)
- **Location**: `client/src/pages/Messages.tsx` → `handleNewMessage()` function
- **Note**: Sender does NOT hear this sound for their own messages

### 3. Typing Sound (Optional)
- **Trigger**: When other participant starts typing
- **Conditions**:
  - Other user is typing (`isTyping === true`)
  - User is viewing the conversation
  - Tab is visible
- **Location**: `client/src/pages/Messages.tsx` → `onTyping()` handler
- **Note**: Can be disabled by removing the `playTyping()` call

### 4. Read Sound (Optional - Sender-only)
- **Trigger**: When recipient reads sender's message
- **Conditions**:
  - `message:seen` event is received
  - User is viewing the conversation
  - Tab is visible
- **Location**: `client/src/pages/Messages.tsx` → `onMessageSeen()` handler
- **Note**: Plays for the sender when their message is read by the recipient

## Code Structure

### Custom Hook: `useChatSounds`
- **Location**: `client/src/hooks/useChatSounds.ts`
- **Features**:
  - Audio unlock handling (browser autoplay policy)
  - Sound management (prevents overlapping sounds)
  - Configurable volume and enable/disable
  - Error handling

### Integration: `Messages.tsx`
- **Location**: `client/src/pages/Messages.tsx`
- **Changes**:
  - Imported `useChatSounds` hook
  - Added sound triggers in appropriate event handlers
  - All sounds respect conversation visibility and tab visibility

## Behavior Notes

### Sound Playback Rules:
1. **Only when viewing conversation**: Sounds only play when user is actively viewing the conversation
2. **Tab visibility**: Sounds won't play if the browser tab is hidden
3. **No self-notification**: Sender doesn't hear "received" sound for their own messages
4. **Audio unlock**: Sounds are automatically unlocked on first user interaction (browser requirement)

### Browser Autoplay Policy:
- Modern browsers block autoplay until user interacts with the page
- The implementation includes audio unlock logic that activates on first user interaction
- This is normal browser behavior, not a bug

## Configuration

### Enable/Disable Sounds:
In `Messages.tsx`, modify the `useChatSounds` hook options:

```typescript
const { playMessageSent, playMessageReceived, playTyping, playMessageRead } = useChatSounds({
  enabled: true,    // Set to false to disable all chat sounds
  volume: 0.6       // Adjust volume (0.0 to 1.0)
});
```

### Disable Individual Sounds:
- **Typing sound**: Remove or comment out `playTyping()` call in `onTyping()` handler
- **Read sound**: Remove or comment out `playMessageRead()` call in `onMessageSeen()` handler

## Testing Checklist

1. **Message Sent Sound**:
   - [ ] Send a message while viewing the conversation
   - [ ] Verify sound plays
   - [ ] Verify sound does NOT play when tab is hidden
   - [ ] Verify sound does NOT play when not viewing conversation

2. **Message Received Sound**:
   - [ ] Receive a message from another user while viewing conversation
   - [ ] Verify sound plays
   - [ ] Verify sound does NOT play for your own messages
   - [ ] Verify sound does NOT play when tab is hidden
   - [ ] Verify sound does NOT play when not viewing conversation

3. **Typing Sound** (if enabled):
   - [ ] Have another user type in the conversation
   - [ ] Verify sound plays when they start typing
   - [ ] Verify sound does NOT play when tab is hidden

4. **Read Sound** (if enabled):
   - [ ] Send a message
   - [ ] Have recipient read the message
   - [ ] Verify sound plays when message is read
   - [ ] Verify sound does NOT play when tab is hidden

## Future Enhancements

1. **Server-side recipient check**: Add server-side logic to check if recipient is also viewing the conversation before playing "sent" sound
2. **User preferences**: Add settings to enable/disable individual sounds
3. **Sound customization**: Allow users to upload custom sound files
4. **Volume control**: Add per-sound volume controls in settings

## Troubleshooting

### Sounds not playing?
1. Check browser console for errors
2. Verify sound files exist in `client/public/sounds/`
3. Verify file names match exactly (case-sensitive)
4. Check if browser autoplay is blocked (user must interact with page first)
5. Verify tab is visible (sounds won't play in hidden tabs)

### Sounds playing too frequently?
- Typing sound may play on every typing event - consider throttling
- Read sound may play for every read message - consider debouncing

### Sounds overlapping?
- The implementation includes logic to stop previous sounds of the same type
- If sounds still overlap, check `activeAudioInstances` Map in `useChatSounds.ts`

## Support

For issues or questions, check:
- Browser console for error messages
- Network tab to verify sound files are loading
- `useChatSounds.ts` for sound playback logic
- `Messages.tsx` for sound trigger conditions

