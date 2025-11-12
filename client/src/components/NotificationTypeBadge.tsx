import React from 'react';
import { NotificationType } from '../contexts/NotificationContext';

interface Props {
  type: NotificationType | string;
  className?: string;
}

function getBadge(type: string): { emoji: string; label: string; bg: string; text: string } {
  switch (type) {
    case 'comment_added':
    case 'reply_added':
      return { emoji: '💬', label: 'Comment', bg: 'bg-blue-50', text: 'text-blue-700' };
    case 'post_reaction_added':
    case 'reaction_added':
      return { emoji: '❤️', label: 'Upvote', bg: 'bg-red-100', text: 'text-red-700' };
    case 'connection_request':
    case 'connection_accepted':
      return { emoji: '🤝', label: 'Connection', bg: 'bg-emerald-50', text: 'text-emerald-700' };
    case 'collaboration_request':
    case 'collaboration_request_approved':
    case 'collaboration_request_declined':
      return { emoji: '👥', label: 'Collaboration', bg: 'bg-blue-50', text: 'text-blue-700' };
    case 'message':
      return { emoji: '✉️', label: 'Message', bg: 'bg-violet-50', text: 'text-violet-700' };
    case 'post_created':
      return { emoji: '📣', label: 'Post', bg: 'bg-yellow-100', text: 'text-yellow-700' };
    default:
      return { emoji: '🔔', label: 'Notification', bg: 'bg-gray-50', text: 'text-gray-700' };
  }
}

const NotificationTypeBadge: React.FC<Props> = ({ type, className = '' }) => {
  const { emoji, label, bg, text } = getBadge(type);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${bg} ${text} ${className}`}
      title={label}
      aria-label={label}
    >
      <span className="mr-1" aria-hidden="true">{emoji}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
};

export default NotificationTypeBadge;


