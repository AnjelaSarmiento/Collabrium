# Notification Deletion Flow Documentation

## Overview
This document explains how notification deletion works in the system, including how counts are updated in both the inbox and the bell icon.

---

## 1. Single Notification Deletion

### Flow for Single Delete (with Undo)

**Step 1: Immediate UI Update**
- Notification is removed from the UI immediately (optimistic update)
- `totalCount` is decremented by 1: `setTotalCount(prev => Math.max(0, prev - 1))`
- Notification is removed from `selectedIds` if it was selected
- **Note**: At this point, the notification is NOT deleted from the backend yet

**Step 2: Undo Toast Display**
- Undo snackbar appears at the bottom center
- A 5-second timer is set for permanent deletion
- Notification data is stored in `undoStack` for potential restoration

**Step 3: After 5 Seconds (if not undone)**
- API call: `DELETE /api/notifications/:id`
- Backend deletes the notification from the database
- `fetchNotifications()` is called to refetch the current page
- This updates `totalCount` from server response (`res.data.pagination.total`)
- `window.dispatchEvent(new Event('notifications:refresh-count'))` is fired
- Undo snackbar is removed

**Step 4: If Undo is Clicked (within 5 seconds)**
- Delete timeout is cleared
- Notification is restored in the UI
- `totalCount` is incremented by 1
- Undo snackbar is removed
- **No API call needed** - notification was never deleted from backend

### Flow for Single Delete (without Undo)

**Step 1: Immediate Backend Deletion**
- API call: `DELETE /api/notifications/:id`
- Backend deletes the notification from the database

**Step 2: Refetch and Update**
- `fetchNotifications()` is called immediately
- `totalCount` is updated from server response
- `window.dispatchEvent(new Event('notifications:refresh-count'))` is fired

---

## 2. Bulk Notification Deletion

### Flow for Bulk Delete

**Step 1: Confirmation Modal**
- User selects multiple notifications (via checkboxes)
- Clicks "Delete Selected (X)" button
- Confirmation modal appears

**Step 2: User Confirms Deletion**
- All selected notification IDs are collected: `Array.from(selectedIds)`
- All deletions are executed in parallel: `Promise.all(idsToDelete.map(id => axios.delete(...)))`
- Backend deletes all notifications from the database

**Step 3: UI Update and Refetch**
- Selected notifications are removed from UI immediately
- `selectedIds` is cleared
- Modal is closed
- `fetchNotifications()` is called to refetch the current page
- `totalCount` is updated from server response
- `window.dispatchEvent(new Event('notifications:refresh-count'))` is fired

**Important**: Bulk delete does NOT use undo functionality - deletions are permanent immediately.

---

## 3. Inbox Count Update Mechanism

### How `totalCount` is Updated in Notifications Page

**Source**: The count comes from the server's `pagination.total` field in the API response.

**Update Triggers**:
1. **Initial Load**: When `fetchNotifications()` is called on page load
2. **After Single Delete**: After the 5-second timeout expires (with undo) or immediately (without undo)
3. **After Bulk Delete**: Immediately after all deletions complete
4. **Real-time Updates**: When new notifications arrive via socket (`socket.on('notification')`)
5. **Refresh Events**: When `notifications:refresh-count` event is fired

**Code Flow**:
```typescript
fetchNotifications() {
  const res = await axios.get('/notifications', { params: {...} });
  setItems(res.data.notifications);
  setTotalCount(res.data.pagination.total); // ← Count from server
}
```

**Why Refetch is Important**:
- The backend groups notifications dynamically (e.g., "John Doe left 3 comments" becomes 1 grouped notification)
- When a notification is deleted, the grouping may change
- The server recalculates the total after grouping
- Frontend refetch ensures the count reflects the server's calculation

---

## 4. Bell Icon Count Update Mechanism

### How `unreadCount` is Updated in Navbar

**Source**: The count comes from `GET /api/notifications/unread-count` endpoint.

**Update Triggers**:
1. **Initial Load**: When component mounts, calls `loadCount()`
2. **Real-time Increments**: When new notification arrives via socket (`socket.on('notification')`), increments by 1
3. **Refresh Events**: When `notifications:refresh-count` event is fired, calls `loadCount()` to fetch fresh count

**Code Flow**:
```typescript
// Initial load
loadCount() {
  const res = await axios.get('/notifications/unread-count');
  setUnreadCount(Number(res.data?.count || 0));
}

// Real-time increment
socket?.on('notification', () => setUnreadCount((c) => c + 1));

// Refresh on deletion
window.addEventListener('notifications:refresh-count', loadCount);
```

**Important Difference**:
- **Inbox count** (`totalCount`): Shows total notifications (read + unread) after grouping
- **Bell icon count** (`unreadCount`): Shows only unread notifications (not grouped)

---

## 5. Notification Type Differences

### Are There Behavioral Differences?

**Short Answer**: No, all notification types are handled identically during deletion.

**All Notification Types**:
- `message`
- `comment_added`
- `reply_added`
- `reaction_added`
- `post_reaction_added`
- `connection_request`
- `connection_accepted`
- `post_created`

**Common Behavior**:
- All types use the same `deleteNotification()` function
- All deletions go through the same API endpoint: `DELETE /api/notifications/:id`
- All trigger the same count update mechanisms
- All can be deleted individually or in bulk

**Special Case: Grouped Notifications**
- Grouped notifications (e.g., "John Doe left 3 comments") are created by the backend
- When a grouped notification is deleted, the backend recalculates grouping
- This is why `fetchNotifications()` is called after deletion - to get the accurate count
- The refetch ensures the count reflects the new grouping state

---

## 6. Event System: `notifications:refresh-count`

### How It Works

**Purpose**: Cross-component communication to update counts when notifications change.

**Components That Fire It**:
- `Notifications.tsx` (inbox page):
  - After single delete completes
  - After bulk delete completes
  - When marking notifications as read/unread

**Components That Listen To It**:
- `Navbar.tsx` (bell icon): Refetches unread count
- `Notifications.tsx` (inbox page): Refetches notifications list
- `NotificationsDropdown.tsx` (dropdown): Refetches notifications list

**Code**:
```typescript
// Fire event
window.dispatchEvent(new Event('notifications:refresh-count'));

// Listen to event
window.addEventListener('notifications:refresh-count', loadCount);
```

---

## 7. Potential Issues and Edge Cases

### Issue 1: Count Mismatch During Undo Window
**Scenario**: User deletes a notification, count decreases by 1, but undo is still available.
**Status**: ✅ Expected behavior - count is optimistic, final count is updated after deletion completes.

### Issue 2: Grouped Notification Deletion
**Scenario**: Deleting a grouped notification (e.g., "3 comments") might change grouping.
**Status**: ✅ Fixed - refetch after deletion ensures accurate count.

### Issue 3: Race Condition with Multiple Deletions
**Scenario**: User rapidly deletes multiple notifications.
**Status**: ✅ Handled - bulk delete uses `Promise.all()` to ensure all deletions complete before refetch.

### Issue 4: Bell Icon Count Not Updating
**Scenario**: Bell icon count doesn't reflect deletions immediately.
**Status**: ✅ Fixed - `notifications:refresh-count` event triggers bell icon refetch.

### Issue 5: Pagination and Count Accuracy
**Scenario**: Count might be inaccurate if user is on page 2+ and deletes notifications.
**Status**: ✅ Handled - refetch includes current page and filter, server returns accurate total.

---

## 8. Summary

### Key Points

1. **Single Delete (with undo)**:
   - Optimistic UI update → Show undo → Wait 5 seconds → Delete from backend → Refetch → Update counts

2. **Single Delete (without undo)**:
   - Delete from backend → Refetch → Update counts

3. **Bulk Delete**:
   - Delete all from backend → Refetch → Update counts

4. **Count Updates**:
   - **Inbox**: Updated via `fetchNotifications()` which gets `pagination.total` from server
   - **Bell Icon**: Updated via `notifications:refresh-count` event which triggers `loadCount()`

5. **No Type Differences**:
   - All notification types are handled identically
   - Grouped notifications require refetch to get accurate count after deletion

6. **Event System**:
   - `notifications:refresh-count` event ensures all components stay in sync

---

## 9. Testing Recommendations

To verify the system works correctly:

1. **Test Single Delete with Undo**:
   - Delete a notification
   - Verify count decreases immediately
   - Verify undo works
   - Verify count updates correctly after 5 seconds

2. **Test Bulk Delete**:
   - Select multiple notifications
   - Delete them
   - Verify count decreases by correct amount
   - Verify bell icon count updates

3. **Test Grouped Notification Delete**:
   - Delete a grouped notification (e.g., "3 comments")
   - Verify count updates correctly after refetch
   - Verify remaining notifications are grouped correctly

4. **Test Different Notification Types**:
   - Delete one of each type
   - Verify all behave identically

5. **Test Bell Icon Count**:
   - Delete unread notifications
   - Verify bell icon count decreases
   - Delete read notifications
   - Verify bell icon count doesn't change (only counts unread)

