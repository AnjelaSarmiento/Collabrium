import React from 'react';
import { getProfileImageUrl } from '../utils/image';

interface TypingActivityBarProps {
  users: Array<{
    userId: string;
    name: string;
    profilePicture?: string;
  }>;
}

const TypingActivityBar: React.FC<TypingActivityBarProps> = ({ users }) => {
  const visibleUsers = users.slice(0, 3);
  const extraCount = users.length > 3 ? users.length - 3 : 0;

  return (
    <div
      className="shrink-0 px-4 py-1 min-h-[32px]"
      role="status"
      aria-live="polite"
      aria-label={users.length > 0 ? `${users.length} participant${users.length > 1 ? 's' : ''} typing` : undefined}
    >
      {users.length === 0 ? (
        <div className="h-4" />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {visibleUsers.map((typingUser) => (
              <img
                key={typingUser.userId}
                src={getProfileImageUrl(typingUser.profilePicture) || '/default-avatar.png'}
                alt={`${typingUser.name}'s avatar`}
                className="h-6 w-6 rounded-full border-2 border-white object-cover shadow-sm"
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span
                className="w-1.5 h-1.5 bg-[#3D61D4] rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-[#3D61D4] rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-[#3D61D4] rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            {extraCount > 0 && (
              <span className="text-xs font-medium text-[#3D61D4]">
                …and {extraCount} {extraCount === 1 ? 'other' : 'others'} are typing
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TypingActivityBar;
