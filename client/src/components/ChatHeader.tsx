import React, { memo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import UserStatusBadge from './UserStatusBadge';
import TypingIndicator from './TypingIndicator';
import { getProfileImageUrl } from '../utils/image';
import {
  EllipsisHorizontalIcon,
  UserCircleIcon,
  BellSlashIcon,
  NoSymbolIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface ChatHeaderProps {
  otherUser: {
    _id: string;
    name: string;
    profilePicture?: string;
  } | null;
  isOtherTyping: boolean;
  otherTypingName: string | null;
  conversationId?: string;
  isMuted?: boolean;
  onViewProfile?: (userId: string) => void;
  onMuteConversation?: (conversationId: string, mute: boolean) => void;
  onShowMuteModal?: (conversationId: string) => void;
  onUnmuteConversation?: (conversationId: string) => void;
  onBlockUser?: (userId: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onReport?: (userId: string) => void;
}

/**
 * Memoized Chat Header component
 * Prevents re-renders when input changes or other unrelated state updates
 */
const ChatHeader: React.FC<ChatHeaderProps> = memo(({ 
  otherUser, 
  isOtherTyping, 
  otherTypingName,
  conversationId,
  isMuted,
  onViewProfile,
  onMuteConversation,
  onShowMuteModal,
  onUnmuteConversation,
  onBlockUser,
  onDeleteConversation,
  onReport,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  if (!otherUser) {
    return null;
  }

  const handleViewProfile = () => {
    setIsMenuOpen(false);
    if (onViewProfile) {
      onViewProfile(otherUser._id);
    } else {
      navigate(`/app/profile/${otherUser._id}`);
    }
  };

  const handleMute = () => {
    console.log('[ChatHeader] Mute clicked:', { conversationId, isMuted });
    setIsMenuOpen(false);
    if (conversationId) {
      if (isMuted) {
        // Unmute directly (no modal needed)
        if (onUnmuteConversation) {
          onUnmuteConversation(conversationId);
        } else if (onMuteConversation) {
          // Fallback to old API
          onMuteConversation(conversationId, false);
        }
      } else {
        // Show mute duration modal
        if (onShowMuteModal) {
          onShowMuteModal(conversationId);
        } else if (onMuteConversation) {
          // Fallback to old API (immediate mute)
          onMuteConversation(conversationId, true);
        }
      }
    } else {
      console.warn('[ChatHeader] Cannot mute: missing conversationId', { conversationId });
    }
  };

  const handleBlock = () => {
    console.log('[ChatHeader] Block clicked:', { userId: otherUser._id, hasHandler: !!onBlockUser });
    setIsMenuOpen(false);
    if (onBlockUser) {
      onBlockUser(otherUser._id);
    } else {
      console.warn('[ChatHeader] Cannot block: missing handler', { onBlockUser });
    }
  };

  const handleDelete = () => {
    console.log('[ChatHeader] Delete clicked:', { conversationId, hasHandler: !!onDeleteConversation });
    setIsMenuOpen(false);
    if (conversationId && onDeleteConversation) {
      if (window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
        onDeleteConversation(conversationId);
      }
    } else {
      console.warn('[ChatHeader] Cannot delete: missing conversationId or handler', { conversationId, onDeleteConversation });
    }
  };

  const handleReport = () => {
    setIsMenuOpen(false);
    if (onReport) {
      onReport(otherUser._id);
    }
  };

  return (
    <div className="p-3 border-b border-gray-200 dark:border-[var(--border-color)]">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <img
              src={getProfileImageUrl(otherUser.profilePicture) || '/default-avatar.png'}
              alt={otherUser.name}
              className="h-10 w-10 rounded-full object-cover"
            />
            <UserStatusBadge 
              userId={otherUser._id} 
              showText={false}
              glow
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white dark:ring-[var(--bg-card)]"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-secondary-900 dark:text-[var(--text-primary)] leading-tight">
                {otherUser.name}
              </h3>
              {isMuted && (
                <span
                  className="text-gray-400 dark:text-[var(--text-muted)]"
                  title="Notifications silenced — you'll still see unread messages in your Inbox."
                >
                  <BellSlashIcon className="h-4 w-4" />
                </span>
              )}
            </div>
            <div className="mt-0.5">
              <UserStatusBadge userId={otherUser._id} showText={true} textOnly={true} key={`status-${otherUser._id}`} />
            </div>
            <TypingIndicator userName={otherTypingName || 'User'} isVisible={isOtherTyping} />
          </div>
        </div>
        
        {/* Actions Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] text-gray-600 dark:text-[var(--icon-color)] hover:text-gray-900 dark:hover:text-[var(--text-primary)] transition-colors"
            aria-label="Conversation options"
          >
            <EllipsisHorizontalIcon className="h-6 w-6" />
          </button>
          
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[var(--bg-card)] rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-[var(--border-color)]">
              <button
                onClick={handleViewProfile}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)]"
              >
                <UserCircleIcon className="h-4 w-4 mr-3" />
                View Profile
              </button>
              
              {conversationId && onMuteConversation && (
                <button
                  onClick={handleMute}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)]"
                >
                  <BellSlashIcon className="h-4 w-4 mr-3" />
                  {isMuted ? 'Unmute Conversation' : 'Mute Conversation'}
                </button>
              )}
              
              {onBlockUser && (
                <button
                  onClick={handleBlock}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)]"
                >
                  <NoSymbolIcon className="h-4 w-4 mr-3" />
                  Block User
                </button>
              )}
              
              {conversationId && onDeleteConversation && (
                <>
                  <div className="border-t border-gray-200 dark:border-[var(--border-color)] my-1" />
                  <button
                    onClick={handleDelete}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <TrashIcon className="h-4 w-4 mr-3" />
                    Delete Conversation
                  </button>
                </>
              )}
              
              {onReport && (
                <>
                  <div className="border-t border-gray-200 dark:border-[var(--border-color)] my-1" />
                  <button
                    onClick={handleReport}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <ExclamationTriangleIcon className="h-4 w-4 mr-3" />
                    Report User
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if user data or typing state changes
  return (
    prevProps.otherUser?._id === nextProps.otherUser?._id &&
    prevProps.otherUser?.name === nextProps.otherUser?.name &&
    prevProps.otherUser?.profilePicture === nextProps.otherUser?.profilePicture &&
    prevProps.isOtherTyping === nextProps.isOtherTyping &&
    prevProps.otherTypingName === nextProps.otherTypingName &&
    prevProps.conversationId === nextProps.conversationId &&
    prevProps.isMuted === nextProps.isMuted
  );
});

ChatHeader.displayName = 'ChatHeader';

export default ChatHeader;

