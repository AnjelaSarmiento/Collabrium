import React, { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
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
  const { socket, onMessageNew } = useSocket();
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

  // Real-time updates: Listen for new messages and update conversations optimistically
  useEffect(() => {
    if (!user || !socket) return;

    const currentUserId = user._id ? user._id.toString() : undefined;

    // Handle new messages - update conversation list in real-time
    const handleMessageNew = (data: { conversationId: string; message: any }) => {
      if (!data?.message) return;

      const sender = data.message.sender;
      let senderId: string | undefined;
      if (typeof sender === 'string') {
        senderId = sender;
      } else if (sender?._id) {
        senderId = sender._id.toString();
      }

      const conversationId = data.conversationId;
      const isFromOtherUser = senderId && currentUserId && senderId !== currentUserId;
      const isCurrentConversation = window.__activeConversationId === conversationId;

      // Update conversations optimistically
      setConversations(prev => {
        const conversationIndex = prev.findIndex(c => c._id === conversationId);

        if (conversationIndex === -1) {
          // Conversation not in list yet - fetch to get the new conversation
          fetchConversations();
          return prev;
        }

        // Update the conversation with new message info
        const updated = [...prev];
        const conversation = updated[conversationIndex];

        // Update lastMessage, lastMessageAt, and unreadCount
        const newUnreadCount = isCurrentConversation
          ? 0 // If viewing this conversation, unreadCount stays at 0
          : (isFromOtherUser
            ? (conversation.unreadCount || 0) + 1 // Increment if from other user and not viewing
            : conversation.unreadCount || 0); // Don't increment for own messages

        updated[conversationIndex] = {
          ...conversation,
          lastMessage: {
            _id: data.message._id,
            content: data.message.content,
            createdAt: data.message.createdAt,
          },
          lastMessageAt: data.message.createdAt,
          unreadCount: newUnreadCount,
        };

      // Sort conversations by lastMessageAt (most recent first)
      updated.sort((a: Conversation, b: Conversation) => {
        const timeA = new Date(a.lastMessageAt || 0).getTime();
        const timeB = new Date(b.lastMessageAt || 0).getTime();
        return timeB - timeA;
      });

      // Calculate total unread count and dispatch event to update Navbar badge
      const totalUnread = updated.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      window.dispatchEvent(new CustomEvent('messages:count-update', { 
        detail: { totalUnread } 
      }));

      return updated;
    });
  };

    // Handle conversation read events - update unread count to 0
    const handleConversationRead = () => {
      // Update conversations to reset unread count for the active conversation
      const activeConversationId = window.__activeConversationId;
      if (activeConversationId) {
        setConversations(prev => {
          const updated = prev.map(conv => {
            if (conv._id === activeConversationId) {
              return { ...conv, unreadCount: 0 };
            }
            return conv;
          });
          
          // Calculate total unread count and dispatch event to update Navbar badge
          const totalUnread = updated.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
          window.dispatchEvent(new CustomEvent('messages:count-update', { 
            detail: { totalUnread } 
          }));
          
          return updated;
        });
      }
      // Also refresh to ensure sync with server
      fetchConversations();
    };

    // Register socket listeners
    const offMessageNew = onMessageNew(handleMessageNew);
    window.addEventListener('conversation:read', handleConversationRead);

    return () => {
      offMessageNew();
      window.removeEventListener('conversation:read', handleConversationRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, socket, onMessageNew]);

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
    // Optimistically update unread count to 0 immediately
    setConversations(prev => {
      const updated = prev.map(c => {
        if (c._id === conv._id) {
          return { ...c, unreadCount: 0 };
        }
        return c;
      });
      
      // Calculate total unread count and dispatch event to update Navbar badge
      const totalUnread = updated.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      window.dispatchEvent(new CustomEvent('messages:count-update', { 
        detail: { totalUnread } 
      }));
      
      return updated;
    });

    // Mark conversation as read
    try {
      await axios.post(`/messages/conversations/${conv._id}/read`);
      // Dispatch event to update navbar count and other components
      window.dispatchEvent(new CustomEvent('conversation:read'));
      // Refresh conversations to ensure sync with server
      fetchConversations();
    } catch (error) {
      console.error('[MessagesDropdown] Failed to mark conversation as read:', error);
      // On error, refresh to get correct state from server
      fetchConversations();
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
      case 'Active': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200';
      case 'Completed': return 'bg-gray-100 text-gray-700 dark:bg-[var(--bg-hover)] dark:text-[var(--text-secondary)]';
      case 'Cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-700 dark:bg-[var(--bg-hover)] dark:text-[var(--text-secondary)]';
    }
  };

  if (!isDropdownOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed top-16 right-4 w-96 bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl border border-secondary-200 dark:border-[var(--border-color)] z-50 max-h-[600px] flex flex-col"
      style={{ display: 'block' }}
    >
      {/* Header */}
      <div className="p-3 border-b border-secondary-200 dark:border-[var(--border-color)] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">Messages</h3>
          <button
            onClick={() => navigate('/app/messages')}
            className="text-xs text-primary-700 dark:text-[var(--link-color)] hover:underline"
          >
            View All
          </button>
        </div>
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-secondary-300 dark:border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-[var(--link-color)] text-sm bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] placeholder-secondary-400 dark:placeholder-[var(--text-muted)]"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto max-h-[550px] scrollbar-hide relative">
        {loading ? (
          <div className="p-4 text-center text-gray-500 dark:text-[var(--text-secondary)] text-sm">Loading...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-[var(--text-secondary)] text-sm">
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
                className="p-3 border-b border-gray-100 dark:border-[var(--border-color)] cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {isRoom ? (
                      <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-[var(--bg-panel)] flex items-center justify-center">
                        <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-[var(--link-color)]" />
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
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white dark:ring-[var(--bg-card)]"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate">
                          {isRoom ? conv.roomName || 'Room' : other?.name}
                        </h4>
                        {isRoom && conv.roomStatus && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getRoomStatusColor(conv.roomStatus)}`}>
                            {conv.roomStatus}
                          </span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <span className="text-xs text-gray-500 dark:text-[var(--text-muted)] ml-2 flex-shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-600 dark:text-[var(--text-secondary)] truncate flex-1">
                        {conv.lastMessage?.content || 'No messages yet'}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {conv.isMuted && (
                          <BellSlashIcon className="h-3 w-3 text-gray-400 dark:text-[var(--text-muted)]" />
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

