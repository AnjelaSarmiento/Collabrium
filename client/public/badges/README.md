# Notification Badge Icons

Store notification badge icon images in this directory.

## Required Files:

Place the following PNG image files (12px × 12px recommended) in this directory:

- `comment.png` - Badge icon for comment notifications
- `reply.png` - Badge icon for reply notifications
- `reaction.png` - Badge icon for upvote/reaction notifications
- `connection.png` - Badge icon for both connection request and connection accepted notifications
- `message.png` - Badge icon for message notifications
- `post-created.png` - Badge icon for post created notifications

## File Path:

```
client/public/badges/comment.png
client/public/badges/reply.png
client/public/badges/reaction.png
client/public/badges/connection.png
client/public/badges/message.png
client/public/badges/post-created.png
```

## Image Specifications:

- **Size**: 12px × 12px (or proportional, will be scaled to h-3 w-3)
- **Format**: PNG (with transparency recommended)
- **Style**: Simple outline/minimal icons work best
- **Color**: Icons will appear in gray (#6B7280) - the badge background provides the color

## Usage:

The images are automatically referenced in:
- Notification Dropdown/Popover (`client/src/components/NotificationsDropdown.tsx`)
- Notifications Inbox Page (`client/src/pages/Notifications.tsx`)

Images are referenced as `/badges/filename.png` and will be served from the public folder.

## Notes:

- Images should be optimized for web (compressed)
- Use transparent backgrounds for best appearance
- Icons will be displayed at 12px × 12px (h-3 w-3 in Tailwind)
- Badge background colors are applied separately (blue, indigo, red, green, yellow)

