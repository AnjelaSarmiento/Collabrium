# Notification & Chat Sounds

Store notification and chat sound files in this directory:

## Notification Sounds (Required):
- `message.mp3` - Sound for message notifications (when message arrives while not viewing conversation)
- `notify.mp3` - Sound for all other notifications (connection requests, comments, reactions, etc.)

## Chat Sounds (Required for Chat Feature):
- `message_sent.mp3` - Sound played when sender sends a message while viewing the conversation
- `message_received.mp3` - Sound played when recipient receives a message while viewing the conversation
- `typing.mp3` - (Optional) Sound played when other participant is typing
- `message_read.mp3` - (Optional) Sound played when recipient reads sender's message

## File Path:
```
client/public/sounds/message.mp3
client/public/sounds/notify.mp3
client/public/sounds/message_sent.mp3
client/public/sounds/message_received.mp3
client/public/sounds/typing.mp3 (optional)
client/public/sounds/message_read.mp3 (optional)
```

## Usage:

### Notification Sounds:
The sounds will be automatically played when notifications are triggered, unless the user has disabled sounds in their settings.

The sounds are referenced in the code as:
- `/sounds/message.mp3` (for message notifications)
- `/sounds/notify.mp3` (for all other notification types)

### Chat Sounds:
Chat sounds are automatically played in the Messages page when:
- **Message Sent**: Sender sends a message while viewing the conversation
- **Message Received**: Recipient receives a message from another user while viewing the conversation
- **Typing**: Other participant starts typing (optional, can be disabled)
- **Message Read**: Recipient reads sender's message (optional, can be disabled)

**Important Notes:**
- Chat sounds only play when the user is actively viewing the conversation
- Sender does NOT hear the "received" sound for their own messages
- Sounds are automatically unlocked on first user interaction (browser autoplay policy)
- All sounds respect tab visibility (won't play if tab is hidden)

## Notes:
- Use short, pleasant sound clips (1-2 seconds recommended)
- Ensure files are optimized for web (compressed)
- Supported formats: MP3, WAV, OGG
- Chat sounds are controlled separately from notification sounds

