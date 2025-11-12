import React, { memo } from 'react';
import { getProfileImageUrl } from '../utils/image';

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

interface MessageItemProps {
  message: Message;
  index: number;
  prevMessage: Message | null;
  isOwn: boolean;
  isLastSeen: boolean;
  isSeenByOther: boolean;
  isLatestOwn: boolean;
  isClicked: boolean;
  isReadVisible: boolean;
  currentStatus: string;
  shouldShowStatus: boolean;
  shouldShowStatusTextOnMostRecent: boolean;
  shouldShowStatusTextOnOthers: boolean;
  isMostRecentAndLastRead: boolean;
  shouldShowReadIndicatorOnLastRead: boolean;
  showDateDivider: boolean;
  gapClass: string;
  otherUser: {
    _id: string;
    name: string;
    profilePicture?: string;
  } | null;
  formatClock: (date: Date) => string;
  formatDayLabel: (date: Date) => string;
  onMessageHoverEnter: (messageId: string) => void;
  onMessageHoverLeave: (messageId: string) => void;
  onMessageClick: (messageId: string) => void;
}

/**
 * Memoized individual message item component
 * Prevents re-renders of unchanged messages when other messages update
 */
const MessageItem: React.FC<MessageItemProps> = memo(({
  message,
  prevMessage,
  isOwn,
  isLastSeen,
  isSeenByOther,
  isLatestOwn,
  isClicked,
  isReadVisible,
  currentStatus,
  shouldShowStatus,
  shouldShowStatusTextOnMostRecent,
  shouldShowStatusTextOnOthers,
  isMostRecentAndLastRead,
  shouldShowReadIndicatorOnLastRead,
  showDateDivider,
  gapClass,
  otherUser,
  formatClock,
  formatDayLabel,
  onMessageHoverEnter,
  onMessageHoverLeave,
  onMessageClick,
}) => {
  const isSending = currentStatus.toLowerCase().includes('progress');
  const currentDate = new Date(message.createdAt);

  return (
    <React.Fragment key={message._id + '-' + message.createdAt}>
      {showDateDivider && (
        <div className="my-4 flex items-center justify-center">
          <span className="px-3 py-1 text-xs text-gray-500 bg-gray-100 rounded-full">
            {formatDayLabel(currentDate)}
          </span>
        </div>
      )}
      <div className={`${gapClass} flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div
          id={`message-${message._id}`}
          className={`relative group flex items-end gap-2 max-w-[85%] md:max-w-[80%] lg:max-w-[65%] xl:max-w-[60%] ${isOwn ? 'flex-row-reverse' : ''}`}
          onMouseEnter={() => onMessageHoverEnter(message._id)}
          onMouseLeave={() => onMessageHoverLeave(message._id)}
          onClick={() => onMessageClick(message._id)}
        >
          {!isOwn && (
            <img
              src={getProfileImageUrl(message.sender.profilePicture) || '/default-avatar.png'}
              alt={message.sender.name}
              className="h-8 w-8 rounded-full object-cover flex-shrink-0"
            />
          )}
          <div className="relative" style={{ minHeight: '36px' }}>
            <div
              className={`rounded-lg px-3 py-2 max-w-full ${isOwn ? (isSending ? 'bg-primary-500 animate-pulse text-white' : 'bg-primary-600 text-white') : 'bg-gray-100 text-secondary-900'}`}
              style={{
                minWidth: '64px',
                minHeight: '36px',
                display: 'inline-block',
                transition: 'none'
              }}
            >
              <p className="text-sm whitespace-pre-wrap break-words break-all">
                {message.content}
              </p>
              <div className={`mt-1 text-[11px] ${isOwn ? 'text-primary-100' : 'text-gray-500'} text-right`}>
                {formatClock(currentDate)}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Status indicators */}
      {shouldShowStatus && (
        <div className={`w-full flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <div className="flex flex-col items-end">
            {(shouldShowStatusTextOnMostRecent || shouldShowStatusTextOnOthers || (isMostRecentAndLastRead && isReadVisible) || (shouldShowReadIndicatorOnLastRead && isReadVisible)) && (
              <span
                className={`block text-xs mt-0.5 ${isSending ? 'animate-pulse text-primary-500 font-bold' : 'text-gray-400'}`}
                style={{
                  minWidth: '80px',
                  maxWidth: '80px',
                  height: '16px',
                  textAlign: 'right',
                  display: 'inline-block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: '16px',
                  transition: 'none'
                }}
              >
                {currentStatus}
              </span>
            )}
            {((isMostRecentAndLastRead && otherUser) || (shouldShowReadIndicatorOnLastRead && otherUser)) && (
              <img
                src={getProfileImageUrl(otherUser.profilePicture) || '/default-avatar.png'}
                alt={otherUser.name}
                className="w-4 h-4 rounded-full border border-gray-300 shadow-sm mt-0.5"
                title={`${otherUser.name} has read this message`}
                style={{ flexShrink: 0 }}
              />
            )}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}, (prevProps, nextProps) => {
  // Only re-render if this specific message's data changes
  return (
    prevProps.message._id === nextProps.message._id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.createdAt === nextProps.message.createdAt &&
    prevProps.message.seenBy?.length === nextProps.message.seenBy?.length &&
    prevProps.message.deliveredTo?.length === nextProps.message.deliveredTo?.length &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.isLastSeen === nextProps.isLastSeen &&
    prevProps.isSeenByOther === nextProps.isSeenByOther &&
    prevProps.isLatestOwn === nextProps.isLatestOwn &&
    prevProps.isClicked === nextProps.isClicked &&
    prevProps.isReadVisible === nextProps.isReadVisible &&
    prevProps.currentStatus === nextProps.currentStatus &&
    prevProps.shouldShowStatus === nextProps.shouldShowStatus &&
    prevProps.showDateDivider === nextProps.showDateDivider &&
    prevProps.gapClass === nextProps.gapClass &&
    prevProps.otherUser?._id === nextProps.otherUser?._id
  );
});

MessageItem.displayName = 'MessageItem';

export default MessageItem;

