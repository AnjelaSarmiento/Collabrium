# Comprehensive Activity Log - All User Actions

This document lists all possible user actions in the Collabrium system that should be tracked in an Activity Log, organized by module/feature.

---

## 1. Authentication & Account Management

### Registration & Login
- **Register account** - User creates new account
- **Login** - User logs into system
- **Logout** - User logs out
- **Google OAuth login** - User logs in via Google
- **Forgot password** - User requests password reset
- **Password reset** - User resets password

---

## 2. Profile Management

### Profile Information
- **Update profile** - Update name, bio, skills, etc.
- **Upload profile picture** - Change profile picture
- **Remove profile picture** - Delete profile picture
- **View own profile** - User views their own profile page
- **View other user profile** - User views another user's profile

### Profile Settings
- **Navigate to profile edit** - User opens profile edit page
- **Save profile changes** - User saves profile updates
- **Cancel profile edit** - User cancels profile editing

---

## 3. Posts & Collaborations

### Post Creation & Management
- **Create post** - Create new collaboration post (Free or Paid)
- **Edit post** - Edit existing post (title, description, tags, deadline, etc.)
- **Delete post** (soft delete) - Move post to bin
- **Restore post from bin** - Restore deleted post
- **Permanently delete post** - Hard delete from bin
- **Bulk permanently delete posts** - Delete multiple posts from bin
- **View post** - View post detail page
- **View own posts** - View user's own posts list
- **View saved posts** - View saved posts page
- **Search posts** - Search/filter posts
- **Sort posts** - Sort by date, reward, upvotes, comments, views

### Post Interactions
- **Save post** - Add post to saved list
- **Unsave post** - Remove post from saved list
- **Upvote post** - Upvote a post
- **Remove upvote** - Remove upvote from post
- **Join post** - Join as collaborator (deprecated, use request-collaboration)
- **Request collaboration** - Request to collaborate on post
- **Cancel collaboration request** - Cancel pending request
- **Approve collaboration request** - Post owner approves request
- **Decline collaboration request** - Post owner declines request
- **Remove collaborator** - Post owner removes collaborator
- **Leave post** - Collaborator leaves post
- **Convert post to room** - Convert post to collaboration room

### Post Comments
- **Add comment** - Comment on a post
- **Edit comment** - Edit own comment
- **Delete comment** - Delete own comment
- **Upvote comment** - Upvote a comment
- **Remove comment upvote** - Remove upvote from comment
- **View comment** - View comment detail (with highlighting)

### Comment Replies
- **Add reply** - Reply to a comment
- **Edit reply** - Edit own reply
- **Delete reply** - Delete own reply
- **Upvote reply** - Upvote a reply
- **Remove reply upvote** - Remove upvote from reply
- **View reply** - View reply detail (with highlighting)

---

## 4. Messages & Conversations

### Direct Messages (DM)
- **Create DM conversation** - Start new DM with user
- **Send message** - Send text message in DM
- **Send message with attachment** - Send message with file/image
- **View conversation** - Open/view conversation
- **Mark conversation as read** - Mark messages as read
- **Mark message as read** (automatic) - Auto-mark when viewing
- **Delete conversation** - Permanently delete conversation
- **View conversation list** - View all conversations
- **Search conversations** - Search in conversation list
- **Select conversation** - Click to open conversation

### Conversation Settings
- **Mute conversation** - Mute notifications for conversation
  - Mute for 15 minutes
  - Mute for 1 hour
  - Mute for 8 hours
  - Mute for 24 hours
  - Mute until manually unmuted
- **Unmute conversation** - Re-enable notifications
- **Block user** - Block user from messaging
- **Unblock user** - Unblock user
- **Report user** - Report user for inappropriate behavior
- **View user profile from chat** - Open profile from chat header

### Room Conversations
- **View room conversation** - Open room chat
- **Send room message** - Send message in room
- **Mark room conversation as read** - Mark room messages as read
- **Mute room conversation** - Mute room notifications
- **Unmute room conversation** - Unmute room notifications

### Typing Indicators
- **Start typing** - User starts typing (socket event)
- **Stop typing** - User stops typing (socket event)

### Message Status
- **Message sent** - Message sent successfully
- **Message delivered** - Message delivered to recipient
- **Message read** - Message read by recipient
- **Message received** (ACK) - Automatic acknowledgment

---

## 5. Rooms & Collaboration

### Room Management
- **View room** - Open room detail page
- **Join room** - Join collaboration room
- **Leave room** - Leave collaboration room
- **Complete room** - Mark room as completed
- **Cancel room** - Cancel room
- **View room list** - View all user's rooms
- **Filter rooms by status** - Filter by Active/Completed/Cancelled

### Room Chat
- **Send room message** - Send message in room chat
- **Share file in room** - Upload/share file in room
- **View shared files** - View files shared in room

### Room Tasks
- **Create task** - Create new task in room
- **Edit task** - Update task details
- **Delete task** - Delete task
- **Assign task** - Assign task to user
- **Unassign task** - Remove assignment
- **Complete task** - Mark task as completed
- **Reopen task** - Reopen completed task
- **Change task priority** - Update task priority (Low/Medium/High/Urgent)
- **Set task due date** - Add/update due date
- **Add task tags** - Add tags to task

### Room Todos
- **Create todo** - Create new todo item
- **Edit todo** - Update todo details
- **Delete todo** - Delete todo
- **Complete todo** - Mark todo as done
- **Uncomplete todo** - Mark todo as incomplete

### Room Notes
- **Create note** - Create new note
- **Edit note** - Update note content
- **Delete note** - Delete note
- **View note** - View note detail

### Room Files
- **Upload file** - Upload file to room
- **Delete file** - Remove file from room
- **Download file** - Download shared file
- **View file** - View file preview

### Room Whiteboard
- **Update whiteboard** - Draw/update whiteboard content
- **View whiteboard** - View whiteboard

---

## 6. Notifications

### Notification Management
- **View notifications** - Open notifications page/dropdown
- **Mark notification as read** - Mark single notification as read
- **Mark all notifications as read** - Mark all as read
- **Delete notification** - Delete single notification
- **View notification detail** - Click to view notification source
- **Navigate from notification** - Click notification to navigate
- **Filter notifications** - Filter by type (comments, reactions, etc.)
- **Search notifications** - Search in notifications

### Notification Preferences
- **Toggle notification sounds** - Enable/disable sound alerts
- **Toggle email notifications** - Enable/disable email alerts
- **Toggle in-app alerts** - Enable/disable in-app toasts
- **Toggle Do Not Disturb** - Enable/disable DND mode
- **Toggle notification type** - Enable/disable specific notification types:
  - Message notifications
  - Comment notifications
  - Reply notifications
  - Reaction notifications
  - Connection request notifications
  - Post creation notifications
- **Toggle show preview** - Show/hide message previews in notifications
- **Set DND schedule** - Configure DND time window

---

## 7. Connections & Social

### Connection Requests
- **Send connection request** - Request to connect with user
- **Accept connection request** - Accept incoming request
- **Decline connection request** - Decline incoming request
- **Cancel connection request** - Cancel outgoing request
- **Remove connection** - Remove existing connection
- **View connections** - View user's connections list
- **Search users** - Search for users to connect with

### User Interactions
- **Block user** - Block user from messaging/viewing
- **Unblock user** - Unblock user
- **Report user** - Report user for inappropriate behavior
- **Review user** - Leave review/rating for user
- **View user reviews** - View reviews for a user

---

## 8. Wallet & Transactions

### Wallet Management
- **View wallet** - View wallet balance and summary
- **View transaction history** - View all transactions
- **Filter transactions** - Filter by transaction type
- **View transaction detail** - View specific transaction

### Wallet Settings
- **Update wallet settings** - Change wallet preferences
- **Toggle auto-accept payments** - Enable/disable auto-accept
- **Set minimum withdrawal** - Set minimum withdrawal amount
- **Change currency display** - Change currency (CollabPoints/USD/PHP)

### Transactions
- **Transfer points** - Transfer CollabPoints to another user
- **Send tip** - Tip another user
- **Purchase points** - Buy CollabPoints (PayPal/GCash)
- **Withdraw points** - Withdraw CollabPoints
- **Complete paid task** - Receive payment for completed task
- **Refund escrow** - Refund escrow for cancelled paid task

---

## 9. Settings & Preferences

### Profile Settings
- **Open settings page** - Navigate to settings
- **Switch settings tab** - Switch between Profile/Wallet/Notifications tabs
- **Edit profile from settings** - Navigate to profile edit

### Notification Settings
- **Toggle sound enabled** - Enable/disable notification sounds
- **Test notification sound** - Play test sound
- **Update notification preferences** - Change notification settings
- **Save notification settings** - Save preference changes

### Wallet Settings
- **Update wallet settings** - Change wallet preferences
- **Save wallet settings** - Save wallet preference changes

---

## 10. Navigation & UI Interactions

### Page Navigation
- **Navigate to feed** - Go to CollabFeed page
- **Navigate to messages** - Go to Messages page
- **Navigate to notifications** - Go to Notifications page
- **Navigate to profile** - Go to Profile page
- **Navigate to settings** - Go to Settings page
- **Navigate to wallet** - Go to Wallet page
- **Navigate to leaderboard** - Go to Leaderboard page
- **Navigate to create post** - Go to Create Post page
- **Navigate to saved posts** - Go to Saved Posts page
- **Navigate to bin** - Go to Bin page
- **Navigate to room** - Go to Room page
- **Navigate back** - Browser back navigation
- **Navigate forward** - Browser forward navigation

### Dropdown/Popover Interactions
- **Open messages dropdown** - Click messages icon
- **Close messages dropdown** - Click outside or toggle
- **Open notifications dropdown** - Click bell icon
- **Close notifications dropdown** - Click outside or toggle
- **Open profile dropdown** - Click profile button
- **Close profile dropdown** - Click outside or toggle
- **Search in messages dropdown** - Type in search field
- **Select conversation from dropdown** - Click conversation in dropdown

### Widget Interactions
- **Open chat widget** - Open DM widget
- **Close chat widget** - Close DM widget
- **Open room widget** - Open room chat widget
- **Close room widget** - Close room widget
- **Expand widget to full view** - Click expand button
- **Minimize widget** - Minimize widget

### View Interactions
- **Scroll messages** - Scroll message list
- **Scroll to bottom** - Auto-scroll to latest message
- **Load more messages** - Pagination/infinite scroll
- **Select text** - Select message text
- **Copy text** - Copy message content
- **Focus input field** - Focus message input
- **Blur input field** - Unfocus message input

---

## 11. Search & Filter

### Post Search
- **Search posts** - Search by title/description/tags
- **Filter by type** - Filter Free Collaboration vs Paid Task
- **Filter by status** - Filter by Open/In Progress/Completed
- **Filter by tags** - Filter by specific tags
- **Filter by reward range** - Filter by min/max reward
- **Sort posts** - Sort by date, reward, upvotes, comments, views
- **Change sort order** - Ascending/descending

### User Search
- **Search users** - Search for users by name
- **Filter search results** - Apply filters to user search

### Conversation Search
- **Search conversations** - Search in conversation list
- **Filter conversations** - Filter by room/DM, unread, etc.

---

## 12. File & Media

### File Uploads
- **Upload profile picture** - Upload new profile picture
- **Upload post attachment** - Attach file to post
- **Upload room file** - Share file in room
- **Upload message attachment** - Attach file to message

### File Management
- **Delete uploaded file** - Remove file
- **Download file** - Download shared file
- **View file preview** - Preview file content

---

## 13. Real-time Events (Socket-based)

### Presence
- **User comes online** - User connects to socket
- **User goes offline** - User disconnects from socket
- **Status change** - User changes online status

### Real-time Updates
- **Receive new message** - Receive message via socket
- **Receive typing indicator** - See user typing
- **Receive read receipt** - See message read status
- **Receive delivery receipt** - See message delivered status
- **Receive notification** - Receive real-time notification
- **Conversation update** - Conversation metadata updated
- **Room update** - Room status/content updated

---

## 14. Admin Actions (if user is admin)

### User Management
- **Change user status** - Activate/deactivate user
- **Award badge** - Award badge to user
- **View admin dashboard** - Access admin panel

### Content Management
- **Delete post (admin)** - Admin deletes post
- **Manage reports** - Handle user reports

---

## 15. System Events (Automatic)

### Automatic Actions
- **Auto-mark message as read** - Automatic when viewing conversation
- **Auto-scroll to bottom** - Automatic on new message
- **Auto-refresh conversations** - Periodic refresh
- **Auto-refresh notifications** - Periodic refresh
- **Session timeout** - Automatic logout
- **Token refresh** - Automatic token renewal

---

## Notes for Implementation

### Action Categories
1. **Create** - Creating new content (posts, messages, tasks, etc.)
2. **Read/View** - Viewing content (pages, posts, profiles, etc.)
3. **Update/Edit** - Modifying existing content
4. **Delete** - Removing content
5. **Interact** - Interactions (upvotes, saves, etc.)
6. **Navigate** - Page/route navigation
7. **Configure** - Settings and preferences
8. **Real-time** - Socket-based events

### Metadata to Track
- **Timestamp** - When action occurred
- **User ID** - Who performed the action
- **Action Type** - What action was performed
- **Target ID** - What was acted upon (post ID, user ID, etc.)
- **Target Type** - Type of target (post, message, user, etc.)
- **IP Address** - User's IP (for security)
- **User Agent** - Browser/device info
- **Session ID** - Session identifier
- **Additional Context** - Any relevant metadata (message content preview, post title, etc.)

### Privacy Considerations
- Some actions may be private (viewing profiles, reading messages)
- Some actions should be public (creating posts, upvoting)
- Consider user privacy settings for activity visibility

