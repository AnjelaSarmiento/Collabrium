import React, { memo } from 'react';
import { getProfileImageUrl } from '../utils/image';
import MessageItem from './MessageItem';

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  content: string;
  createdAt: string;
  seenBy?: string[];
  deliveredTo?: Array<{
    userId: string;
    deliveredAt: string;
  }>;
}

interface MessageListProps {
  messages: Message[];
  currentUserId: string | undefined;
  otherUser: {
    _id: string;
    name: string;
    profilePicture?: string;
  } | null;
  // Status-related props (memoized to prevent unnecessary re-renders)
  messageStatuses: Record<string, string>;
  renderedStatuses: Record<string, string>;
  stickyTimes: Set<string>;
  readVisible: Set<string>;
  // Callbacks (should be stable)
  onMessageHoverEnter: (messageId: string) => void;
  onMessageHoverLeave: (messageId: string) => void;
  onMessageClick: (messageId: string) => void;
  // Helper functions (should be stable)
  getHighestStatus: (messageId: string, message: Message) => string;
  getStatusPriority: (status: string) => number;
  formatClock: (date: Date) => string;
  formatDayLabel: (date: Date) => string;
  isSameDay: (a: Date, b: Date) => boolean;
}

/**
 * Memoized Message List component
 * Prevents re-renders when input changes or unrelated state updates
 * 
 * PERFORMANCE NOTES:
 * - Individual messages are rendered via memoized MessageItem components
 * - Only changed messages re-render, not the entire list
 * - For conversations with 1000+ messages, consider implementing virtualization
 *   (e.g., react-window or react-virtualized) to render only visible messages
 */
const MessageList: React.FC<MessageListProps> = memo(({
  messages,
  currentUserId,
  otherUser,
  messageStatuses,
  renderedStatuses,
  stickyTimes,
  readVisible,
  onMessageHoverEnter,
  onMessageHoverLeave,
  onMessageClick,
  getHighestStatus,
  getStatusPriority,
  formatClock,
  formatDayLabel,
  isSameDay,
}) => {
  // Calculate lastSeenIndex and lastOwnIndex
  let lastSeenIndex = -1;
  let lastOwnIndex = -1;
  const userId = currentUserId || '';
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.sender._id === userId) {
      if (lastOwnIndex === -1) {
        lastOwnIndex = i;
      }
      if (lastSeenIndex === -1 && message.seenBy && message.seenBy.length > 0) {
        lastSeenIndex = i;
      }
      if (lastSeenIndex !== -1 && lastOwnIndex !== -1) {
        break;
      }
    }
  }

  return (
    <>
      {messages.map((message, index) => {
        const isOwn = message.sender._id === userId;
        const isLastSeen = isOwn && lastSeenIndex === index;
        const isSeenByOther = isOwn && message.seenBy && message.seenBy.length > 0;
        const isLatestOwn = isOwn && index === lastOwnIndex;
        const isClicked = stickyTimes.has(message._id);
        const isReadVisible = readVisible.has(message._id);

        // Get status
        const highestStatus = getHighestStatus(message._id, message);
        const currentStatus = highestStatus || (isSeenByOther ? 'Read' : (message.deliveredTo && message.deliveredTo.length > 0 ? 'Delivered' : 'Sent'));

        // Status visibility logic
        const isMostRecentAndLastRead = isOwn && isLatestOwn && isLastSeen;
        const shouldShowStatusTextOnMostRecent = isOwn && isLatestOwn && !isLastSeen;
        const shouldShowReadIndicatorOnLastRead = isOwn && isSeenByOther && isLastSeen && !isLatestOwn;
        const shouldShowStatusTextOnOthers = isOwn && !isLatestOwn && isClicked && !shouldShowReadIndicatorOnLastRead;

        const currentDate = new Date(message.createdAt);
        const prev = index > 0 ? messages[index - 1] : null;
        const prevDate = prev ? new Date(prev.createdAt) : null;
        const showDateDivider = !prevDate || !isSameDay(currentDate, prevDate);
        
        let gapClass = 'mt-1';
        if (!showDateDivider && prev && prev.sender._id === message.sender._id) {
          const gapMinutes = Math.floor((currentDate.getTime() - (prevDate?.getTime() || 0)) / 60000);
          if (gapMinutes <= 2) gapClass = 'mt-1';
          else if (gapMinutes <= 5) gapClass = 'mt-3';
          else gapClass = 'mt-4';
        } else if (!showDateDivider && prev && prev.sender._id !== message.sender._id) {
          gapClass = 'mt-3';
        } else {
          gapClass = 'mt-6';
        }

        // Determine if status should be shown
        const shouldShowStatus = isOwn && currentStatus && (
          (shouldShowStatusTextOnMostRecent) ||
          (shouldShowStatusTextOnOthers) ||
          (isMostRecentAndLastRead && isReadVisible) ||
          (shouldShowReadIndicatorOnLastRead && isReadVisible && currentStatus === 'Read')
        );

        return (
          <MessageItem
            key={message._id + '-' + message.createdAt}
            message={message}
            index={index}
            prevMessage={prev}
            isOwn={isOwn}
            isLastSeen={isLastSeen}
            isSeenByOther={!!isSeenByOther}
            isLatestOwn={isLatestOwn}
            isClicked={isClicked}
            isReadVisible={isReadVisible}
            currentStatus={currentStatus}
            shouldShowStatus={!!shouldShowStatus}
            shouldShowStatusTextOnMostRecent={shouldShowStatusTextOnMostRecent}
            shouldShowStatusTextOnOthers={!!shouldShowStatusTextOnOthers}
            isMostRecentAndLastRead={isMostRecentAndLastRead}
            shouldShowReadIndicatorOnLastRead={!!shouldShowReadIndicatorOnLastRead}
            showDateDivider={showDateDivider}
            gapClass={gapClass}
            otherUser={otherUser}
            formatClock={formatClock}
            formatDayLabel={formatDayLabel}
            onMessageHoverEnter={onMessageHoverEnter}
            onMessageHoverLeave={onMessageHoverLeave}
            onMessageClick={onMessageClick}
          />
        );
      })}
    </>
  );
}, (prevProps, nextProps) => {
  // Only re-render if messages or status-related props change
  // Compare messages by ID and length
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (prevProps.messages.some((m, i) => m._id !== nextProps.messages[i]?._id)) return false;
  
  // Compare status objects (shallow comparison)
  const prevStatusKeys = Object.keys(prevProps.messageStatuses);
  const nextStatusKeys = Object.keys(nextProps.messageStatuses);
  if (prevStatusKeys.length !== nextStatusKeys.length) return false;
  if (prevStatusKeys.some(key => prevProps.messageStatuses[key] !== nextProps.messageStatuses[key])) return false;
  
  // Compare other props
  return (
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.otherUser?._id === nextProps.otherUser?._id &&
    prevProps.stickyTimes === nextProps.stickyTimes &&
    prevProps.readVisible === nextProps.readVisible
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;

