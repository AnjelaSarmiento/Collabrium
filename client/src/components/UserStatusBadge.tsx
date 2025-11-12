import React from 'react';
import { usePresence } from '../contexts/PresenceContext';

interface UserStatusBadgeProps {
  userId: string;
  showText?: boolean;
  className?: string;
  glow?: boolean; // subtle pulse when online
  textOnly?: boolean; // when true with showText, render only text (no dot)
}

const UserStatusBadge: React.FC<UserStatusBadgeProps> = ({ 
  userId, 
  showText = true, 
  className = '',
  glow = false,
  textOnly = false,
}) => {
  const { getUserStatus, formatLastSeen } = usePresence();
  const { status, lastSeen } = getUserStatus(userId);

  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    if (status === 'online') {
      return 'Online';
    } else if (status === 'away') {
      return 'Away';
    } else if (lastSeen) {
      return `Last online ${formatLastSeen(lastSeen)}`;
    } else {
      return 'Offline';
    }
  };

  if (!showText) {
    return (
      <span 
        className={`inline-block w-2 h-2 rounded-full ${getStatusColor()} ${glow && status === 'online' ? 'animate-pulse' : ''} ${className}`}
        title={getStatusText()}
      />
    );
  }

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      {!textOnly && (
        <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor()} ${glow && status === 'online' ? 'animate-pulse' : ''}`} />
      )}
      <span className="text-xs font-medium text-gray-600">
        {getStatusText()}
      </span>
    </div>
  );
};

export default UserStatusBadge;
