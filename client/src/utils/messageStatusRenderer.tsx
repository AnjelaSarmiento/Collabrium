import React from 'react';
import { getProfileImageUrl } from './image';

interface MessageStatusRendererProps {
  isOwnMessage: boolean;
  status: string;
  messageId: string;
  isLatest: boolean;
  isMostRecentlyRead: boolean;
  isActive: boolean; // Whether the message bubble is clicked
  readIndicatorUser?: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  readIndicatorUsers?: Array<{
    userId: string;
    name: string;
    profilePicture?: string;
  }>;
}

/**
 * Consolidated message status renderer that applies the same rules across all views.
 * 
 * Rules:
 * - If message is NOT read: show status text (Sent/Delivered) automatically
 * - If message IS read: show only the tiny read-avatar on the most-recently-read message
 * - "Read" text should NOT show automatically - only on click
 */
export const MessageStatusRenderer: React.FC<MessageStatusRendererProps> = ({
  isOwnMessage,
  status,
  messageId,
  isLatest,
  isMostRecentlyRead,
  isActive,
  readIndicatorUser,
  readIndicatorUsers,
}) => {
  if (!isOwnMessage || !status) return null;

  // Rule: Read indicator shows only on the most recently read message
  // For room chats, also require that there are read users
  const hasReadUsers = readIndicatorUser || (readIndicatorUsers && readIndicatorUsers.length > 0);
  const shouldShowReadIndicator = status === 'Read' && isMostRecentlyRead && hasReadUsers;
  
  // Rule: Status text display logic
  // - If message is NOT read: show status text automatically (if latest) or on click (if older)
  // - If message IS read: show status text ONLY when clicked (never automatically)
  const isRead = status === 'Read';
  const shouldShowStatusText = isRead ? isActive : (isLatest ? true : isActive);

  if (!shouldShowStatusText && !shouldShowReadIndicator) {
    return null;
  }

  const isSending = status.toLowerCase().includes('progress');

  return (
    <>
      {/* Read indicator: Show only on the most recently read message */}
      {shouldShowReadIndicator && status === 'Read' && (
        <div className="w-full flex justify-end">
          <div className="flex flex-col items-end">
            {/* Status text shows only when clicked */}
            {shouldShowStatusText && (
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
                {status}
              </span>
            )}
            {/* Tiny avatar(s) always visible for the most recently read message */}
            {readIndicatorUser && (
              <img
                key={`read-indicator-${messageId}`}
                src={getProfileImageUrl(readIndicatorUser.profilePicture) || '/default-avatar.png'}
                alt={readIndicatorUser.name}
                className="w-4 h-4 rounded-full border border-gray-300 shadow-sm mt-0.5"
                title={`${readIndicatorUser.name} has read this message`}
                style={{ flexShrink: 0 }}
              />
            )}
            {readIndicatorUsers && readIndicatorUsers.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                {readIndicatorUsers.slice(0, 3).map(reader => (
                  <img
                    key={reader.userId}
                    src={getProfileImageUrl(reader.profilePicture) || '/default-avatar.png'}
                    alt={`${reader.name} read indicator`}
                    className="w-4 h-4 rounded-full border border-gray-300 shadow-sm"
                    title={`${reader.name} has read this message`}
                    style={{ flexShrink: 0 }}
                  />
                ))}
                {readIndicatorUsers.length > 3 && (
                  <span className="text-[10px] text-gray-400">+{readIndicatorUsers.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Status text: Show only when clicked (for messages without read indicator) */}
      {shouldShowStatusText && !shouldShowReadIndicator && (
        <div className="w-full flex justify-end"> 
          <div className="flex flex-col items-end">
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
              {status}
            </span>
          </div>
        </div>
      )}
    </>
  );
};

