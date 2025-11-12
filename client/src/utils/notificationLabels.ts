/**
 * Utility functions for notification labels and time grouping
 */

/**
 * Maps notification types to user-friendly labels
 */
export function getNotificationTypeLabel(type: string): string {
  switch (type) {
    case 'connection_request':
    case 'connection_accepted':
      return 'Connection';
    case 'collaboration_request':
    case 'collaboration_request_approved':
    case 'collaboration_request_declined':
      return 'Collaboration';
    case 'comment_added':
    case 'reply_added':
      return 'Comment';
    case 'reaction_added':
    case 'post_reaction_added':
      return 'Upvote';
    case 'message':
      return 'Message';
    case 'post_created':
      return 'Post';
    default:
      return 'Notification';
  }
}

/**
 * Groups notifications by time period (Today, Yesterday, Earlier)
 */
export type TimeGroup = 'Today' | 'Yesterday' | 'Earlier';

export interface GroupedNotification<T> {
  timeGroup: TimeGroup;
  notifications: T[];
}

export function groupNotificationsByTime<T extends { createdAt?: Date | string }>(
  notifications: T[]
): GroupedNotification<T>[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { [key in TimeGroup]: T[] } = {
    Today: [],
    Yesterday: [],
    Earlier: []
  };

  notifications.forEach((notification) => {
    if (!notification.createdAt) {
      groups.Earlier.push(notification);
      return;
    }
    
    const notificationDate = new Date(notification.createdAt);
    const notificationDay = new Date(
      notificationDate.getFullYear(),
      notificationDate.getMonth(),
      notificationDate.getDate()
    );

    if (notificationDay.getTime() === today.getTime()) {
      groups.Today.push(notification);
    } else if (notificationDay.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(notification);
    } else {
      groups.Earlier.push(notification);
    }
  });

  // Return groups in order: Today, Yesterday, Earlier (only if they have items)
  const result: GroupedNotification<T>[] = [];
  if (groups.Today.length > 0) {
    result.push({ timeGroup: 'Today', notifications: groups.Today });
  }
  if (groups.Yesterday.length > 0) {
    result.push({ timeGroup: 'Yesterday', notifications: groups.Yesterday });
  }
  if (groups.Earlier.length > 0) {
    result.push({ timeGroup: 'Earlier', notifications: groups.Earlier });
  }

  return result;
}

