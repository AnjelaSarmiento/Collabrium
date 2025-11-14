import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getProfileImageUrl } from '../utils/image';
import UserStatusBadge from './UserStatusBadge';
import { BellSlashIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useMessagesWidget } from '../contexts/MessagesWidgetContext';

interface Conversation {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    profilePicture?: string;
  }>;
  lastMessage?: {
    _id: string;
    content: string;
    createdAt: string;
  };
  lastMessageAt: string;
  unreadCount: number;
  isMuted?: boolean;
  otherParticipant?: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  isRoom?: boolean;
  roomId?: string;
  roomName?: string;
  roomStatus?: 'Active' | 'Completed' | 'Cancelled';
}

const MessagesDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openDMWidget, openRoomWidget, isDropdownOpen } = useMessagesWidget();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  // Refresh conversations when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && user) {
      setLoading(true);
      fetchConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDropdownOpen, user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Check if click is on the Messages button (don't close if clicking the button)
        const messagesButton = document.querySelector('[aria-label="Open messages"]');
        if (messagesButton && messagesButton.contains(target)) {
          return; // Don't close if clicking the button
        }
        onClose();
      }
    };

    // Add a small delay to avoid immediate close when opening
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen, onClose]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/messages/conversations');
      if (response.data.success) {
        const conversationsData = response.data.conversations || [];
        console.log('[MessagesDropdown] Fetched conversations:', conversationsData.length);
        setConversations(conversationsData);
      } else {
        console.warn('[MessagesDropdown] API returned success: false');
      }
    } catch (error: any) {
      console.error('[MessagesDropdown] Failed to fetch conversations:', error);
      if (error.response) {
        console.error('[MessagesDropdown] Response status:', error.response.status);
        console.error('[MessagesDropdown] Response data:', error.response.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(conv => {
      if (conv.isRoom) {
        return conv.roomName?.toLowerCase().includes(term);
      } else {
        const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
        return other?.name.toLowerCase().includes(term);
      }
    });
  }, [conversations, searchTerm, user?._id]);

  const handleConversationClick = async (conv: Conversation) => {
    // Mark conversation as read
    try {
      await axios.post(`/messages/conversations/${conv._id}/read`);
      // Dispatch event to update navbar count
      window.dispatchEvent(new CustomEvent('conversation:read'));
      // Refresh conversations to update unread counts
      fetchConversations();
    } catch (error) {
      console.error('[MessagesDropdown] Failed to mark conversation as read:', error);
    }
    
    if (conv.isRoom && conv.roomId) {
      // Open room widget
      openRoomWidget(conv._id, conv.roomId, conv.roomName || 'Room');
    } else {
      // Open DM widget
      const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
      if (other) {
        openDMWidget(conv._id, {
          _id: other._id,
          name: other.name,
          profilePicture: other.profilePicture
        });
      }
    }
  };

  const getRoomStatusColor = (status?: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-700';
      case 'Completed': return 'bg-gray-100 text-gray-700';
      case 'Cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (!isDropdownOpen) return null;

  return (
    <div
      ref={containerRef}
      className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-[100] max-h-[600px] flex flex-col"
      style={{ display: 'block' }}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-secondary-900">Messages</h3>
          <button
            onClick={() => navigate('/app/messages')}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View All
          </button>
        </div>
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto max-h-[500px]">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {searchTerm ? 'No conversations found' : 'No messages yet'}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isRoom = conv.isRoom && conv.roomId;
            const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
            
            return (
              <div
                key={conv._id}
                onClick={() => handleConversationClick(conv)}
                className="p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {isRoom ? (
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <UserGroupIcon className="h-5 w-5 text-blue-600" />
                      </div>
                    ) : (
                      <>
                        <img
                          src={getProfileImageUrl(other?.profilePicture) || '/default-avatar.png'}
                          alt={other?.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                        <UserStatusBadge 
                          userId={other?._id || ''} 
                          showText={false}
                          glow
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-secondary-900 truncate">
                          {isRoom ? conv.roomName || 'Room' : other?.name}
                        </h4>
                        {isRoom && conv.roomStatus && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getRoomStatusColor(conv.roomStatus)}`}>
                            {conv.roomStatus}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-600 truncate flex-1">
                        {conv.lastMessage?.content || 'No messages yet'}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {conv.isMuted && (
                          <BellSlashIcon className="h-3 w-3 text-gray-400" />
                        )}
                        {conv.unreadCount > 0 && (
                          <span className="bg-primary-600 text-white text-xs font-medium rounded-full px-2 py-0.5 min-w-[20px] text-center">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MessagesDropdown;

