import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getProfileImageUrl } from '../utils/image';
import { useMessagesWidget } from '../contexts/MessagesWidgetContext';
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  UserGroupIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import UserStatusBadge from './UserStatusBadge';
import TypingActivityBar from './TypingActivityBar';
import { MessageStatusRenderer } from '../utils/messageStatusRenderer';
import { useAutosizeTextarea } from '../hooks/useAutosizeTextarea';
import { isMobileDevice } from '../utils/deviceDetection';

interface RoomChatWidgetProps {
  conversationId: string;
  roomId: string;
  roomName: string;
}

type TypingUser = {
  userId: string;
  name: string;
  profilePicture?: string;
};

const RoomChatWidget: React.FC<RoomChatWidgetProps> = ({ conversationId, roomId, roomName }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { closeWidget, openWidgets } = useMessagesWidget();
  const { joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, ackMessageReceived, onTyping, sendTyping, joinRoom, leaveRoom } = useSocket();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, string>>({});
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const textareaRef = useAutosizeTextarea(newMessage, { minRows: 1, maxRows: 6, maxHeight: 160 });
  const computeStatusForMessage = (message: any): string => {
    const senderId = message?.sender?._id?.toString();
    const currentUserId = user?._id?.toString();
    if (!senderId || senderId !== currentUserId) return '';

    if (Array.isArray(message?.seenBy) && message.seenBy.length > 0) {
      return 'Read';
    }
    if (Array.isArray(message?.deliveredTo) && message.deliveredTo.length > 0) {
      return 'Delivered';
    }
    return 'Sent';
  };
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const participantInfoRef = useRef<Map<string, { name: string; profilePicture?: string }>>(new Map());
  const [participants, setParticipants] = useState<any[]>([]);

  // Calculate position based on widget index (if multiple widgets are open)
  const widgetIndex = openWidgets.findIndex(w => w.conversationId === conversationId);
  const rightOffset = widgetIndex * (420 + 16); // 420px width + 16px gap

  const latestOwnMessageId = useMemo(() => {
    const currentUserId = user?._id ? user._id.toString() : '';
    if (!currentUserId) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg?.sender?._id?.toString() === currentUserId) {
        return typeof msg._id === 'string' ? msg._id : String(msg._id);
      }
    }
    return null;
  }, [messages, user?._id]);

  // Find the most recently read message (the last message in chronological order that is read)
  const mostRecentlyReadMessageId = useMemo(() => {
    const currentUserId = user?._id ? user._id.toString() : '';
    if (!currentUserId) return null;
    
    // Find the last message in the array that is read (most recent chronologically)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const senderId = msg?.sender?._id?.toString();
      if (senderId !== currentUserId) continue;
      
      const seenBy = Array.isArray(msg.seenBy) ? msg.seenBy : [];
      const isRead = seenBy.length > 0; // In room chats, if seenBy has any entries, it's read
      
      if (isRead) {
        return typeof msg._id === 'string' ? msg._id : String(msg._id);
      }
    }
    
    return null;
  }, [messages, user?._id]);

  const upsertParticipantInfo = (id: string, name?: string, profilePicture?: string) => {
    if (!id) return;
    const map = participantInfoRef.current;
    const existing = map.get(id);
    const nextName = name || existing?.name || 'Participant';
    const nextPicture = profilePicture ?? existing?.profilePicture;
    if (!existing || existing.name !== nextName || existing.profilePicture !== nextPicture) {
      map.set(id, { name: nextName, profilePicture: nextPicture });
    }
  };

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const response = await axios.get(`/rooms/${roomId}`);
        const roomData = response.data?.room;
        if (roomData?.participants) {
          setParticipants(roomData.participants);
          roomData.participants.forEach((p: any) => {
            const participantId = p?.user?._id ? p.user._id.toString() : null;
            if (participantId) {
              upsertParticipantInfo(participantId, p.user.name, p.user.profilePicture);
            }
          });
        }
      } catch (error) {
        console.error('[RoomChatWidget] Failed to fetch room participants:', error);
      }
    };

    if (roomId) {
      fetchParticipants();
    }
  }, [roomId]);

  useEffect(() => {
    if (!conversationId || !roomId) return;

    console.log('[RoomChatWidget] Initializing for conversation:', conversationId, 'room:', roomId);
    fetchMessages();
    joinConversation(conversationId);
    joinRoom(roomId);
    window.__activeConversationId = conversationId;

    const handleMessageNew = (data: { conversationId: string; message: any }) => {
      console.log('[RoomChatWidget] Received message:new event:', data);
      if (data.conversationId === conversationId) {
        setMessages(prev => {
          const next = [...prev];
          const index = next.findIndex(m => m._id === data.message._id);
          if (index !== -1) {
            next[index] = data.message;
          } else {
            console.log('[RoomChatWidget] Adding new message to list');
            next.push(data.message);
          }
          return next;
        });
        const status = computeStatusForMessage(data.message);
        if (status) {
          setMessageStatuses(prev => ({ ...prev, [data.message._id]: status }));
        }
        if (data.message?.sender?._id) {
          upsertParticipantInfo(data.message.sender._id.toString(), data.message.sender.name, data.message.sender.profilePicture);
        }
        ackMessageReceived(conversationId, data.message._id);
        // Don't auto-select message - status text should only show on click
        setTimeout(() => scrollToBottom(), 50);
      }
    };

    const handleMessageSent = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        setMessageStatuses(prev => ({ ...prev, [data.messageId]: 'Sent' }));
      }
    };

    const handleMessageDelivered = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        setMessageStatuses(prev => ({ ...prev, [data.messageId]: 'Delivered' }));
      }
    };

    const handleTyping = (data: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => {
      const incomingConversationId = data.conversationId;
      const incomingUserId = data.userId ? data.userId.toString() : '';
      const currentUserId = user?._id ? user._id.toString() : '';
      if (incomingConversationId === conversationId && incomingUserId && incomingUserId !== currentUserId) {
        if (data.isTyping) {
          const info = participantInfoRef.current.get(incomingUserId);
          const typingUser: TypingUser = {
            userId: incomingUserId,
            name: info?.name || data.userName || 'Participant',
            profilePicture: info?.profilePicture,
          };
          setTypingUsers(prev => {
            const existingIndex = prev.findIndex(u => u.userId === incomingUserId);
            if (existingIndex !== -1) {
              const next = [...prev];
              next[existingIndex] = typingUser;
              return next;
            }
            return [...prev, typingUser];
          });
          const existingTimeout = typingTimeoutsRef.current.get(incomingUserId);
          if (existingTimeout) clearTimeout(existingTimeout);
          const timeoutId = setTimeout(() => {
            setTypingUsers(current => current.filter(u => u.userId !== incomingUserId));
            typingTimeoutsRef.current.delete(incomingUserId);
          }, 1200);
          typingTimeoutsRef.current.set(incomingUserId, timeoutId);
        } else {
          setTypingUsers(prev => prev.filter(u => u.userId !== incomingUserId));
          const existingTimeout = typingTimeoutsRef.current.get(incomingUserId);
          if (existingTimeout) clearTimeout(existingTimeout);
          typingTimeoutsRef.current.delete(incomingUserId);
        }
      }
    };

    const handleMessageSeen = (data: { conversationId: string; userId: string; seq?: number; timestamp?: string; nodeId?: string }) => {
      if (data.conversationId !== conversationId) return;

      const readerId = data.userId ? data.userId.toString() : '';
      const currentUserId = user?._id ? user._id.toString() : '';
      if (!readerId || readerId === currentUserId) return;

      const readerInfo = participantInfoRef.current.get(readerId);
      if (!readerInfo) {
        upsertParticipantInfo(readerId);
      }

      setMessages(prev => {
        let hasUpdates = false;
        const nextMessages = prev.map(msg => {
          const senderId = msg?.sender?._id?.toString();
          if (senderId === currentUserId) {
            const seenList = Array.isArray(msg.seenBy) ? msg.seenBy : [];
            const seenSet = new Set(seenList.map((id: any) => (typeof id === 'object' && id !== null && 'toString' in id) ? id.toString() : String(id)));
            if (!seenSet.has(readerId)) {
              hasUpdates = true;
              seenSet.add(readerId);
              return { ...msg, seenBy: Array.from(seenSet) };
            }
          }
          return msg;
        });

        if (hasUpdates) {
          setMessageStatuses(prevStatuses => {
            const nextStatuses = { ...prevStatuses };
            nextMessages.forEach(msg => {
              const senderId = msg?.sender?._id?.toString();
              if (senderId === currentUserId) {
                if (Array.isArray(msg.seenBy) && msg.seenBy.some((id: any) => (typeof id === 'object' && id !== null && 'toString' in id ? id.toString() : String(id)) === readerId)) {
                  nextStatuses[msg._id] = 'Read';
                }
              }
            });
            return nextStatuses;
          });
        }

        return nextMessages;
      });
    };

    const offMessageNew = onMessageNew(handleMessageNew);
    const offMessageSent = onMessageSent(handleMessageSent);
    const offMessageDelivered = onMessageDelivered(handleMessageDelivered);
    const offMessageSeen = onMessageSeen(handleMessageSeen);
    const offTyping = onTyping(handleTyping);

    return () => {
      offMessageNew();
      offMessageSent();
      offMessageDelivered();
      offMessageSeen();
      offTyping();
      typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
      setTypingUsers([]);
      sendTyping(conversationId, false, user?.name);
      leaveConversation(conversationId);
      leaveRoom(roomId);
      if (window.__activeConversationId === conversationId) {
        window.__activeConversationId = undefined;
      }
    };
  }, [conversationId, roomId, joinConversation, leaveConversation, joinRoom, leaveRoom, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, onTyping, ackMessageReceived, user?._id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      console.log('[RoomChatWidget] Fetching messages for conversation:', conversationId);
      const response = await axios.get(`/messages/conversations/${conversationId}/messages`);
      if (response.data.success) {
        const fetchedMessages = response.data.messages || [];
        console.log('[RoomChatWidget] Fetched messages:', fetchedMessages.length);
        setMessages(fetchedMessages);
        const statusMap: Record<string, string> = {};
        fetchedMessages.forEach((msg: any) => {
          const status = computeStatusForMessage(msg);
          if (status) {
            statusMap[msg._id] = status;
          }
          if (msg?.sender?._id) {
            upsertParticipantInfo(msg.sender._id.toString(), msg.sender.name, msg.sender.profilePicture);
          }
        });
        setMessageStatuses(statusMap);
        // Mark as read
        try {
          await axios.post(`/messages/conversations/${conversationId}/read`);
          // Dispatch event to update navbar count
          window.dispatchEvent(new CustomEvent('conversation:read'));
        } catch (readError) {
          console.error('[RoomChatWidget] Failed to mark as read:', readError);
        }
        // Scroll to bottom after messages load
        setTimeout(() => scrollToBottom(), 100);
      } else {
        console.warn('[RoomChatWidget] API returned success: false');
      }
    } catch (error: any) {
      console.error('[RoomChatWidget] Failed to fetch messages:', error);
      if (error.response) {
        console.error('[RoomChatWidget] Response status:', error.response.status);
        console.error('[RoomChatWidget] Response data:', error.response.data);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSending(true);
    const selfTimer = typingTimeoutsRef.current.get('__self__');
    if (selfTimer) {
      clearTimeout(selfTimer);
      typingTimeoutsRef.current.delete('__self__');
    }
    sendTyping(conversationId, false, user?.name);

    try {
      console.log('[RoomChatWidget] Sending message:', messageContent);
      const response = await axios.post(`/messages/conversations/${conversationId}/messages`, {
        content: messageContent,
        attachments: []
      });
      console.log('[RoomChatWidget] Message sent successfully:', response.data);
      const savedMessage = response.data?.message;
      if (savedMessage) {
        setMessages(prev => {
          const next = [...prev];
          const index = next.findIndex(m => m._id === savedMessage._id);
          if (index !== -1) {
            next[index] = savedMessage;
          } else {
            next.push(savedMessage);
          }
          return next;
        });
        const status = computeStatusForMessage(savedMessage) || 'Sent';
        setMessageStatuses(prev => ({ ...prev, [savedMessage._id]: status }));
        // Don't auto-select message - status text should only show on click
        setTimeout(() => scrollToBottom(), 50);
      }
    } catch (error: any) {
      console.error('[RoomChatWidget] Error sending message:', error);
      if (error.response) {
        console.error('[RoomChatWidget] Response status:', error.response.status);
        console.error('[RoomChatWidget] Response data:', error.response.data);
      }
      setNewMessage(messageContent);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageStatus = (message: any): string => {
    const senderId = message?.sender?._id?.toString();
    if (!senderId || senderId !== user?._id?.toString()) return '';
    if (messageStatuses[message._id]) return messageStatuses[message._id];
    return computeStatusForMessage(message);
  };


  const getReadUsersForMessage = (message: any): TypingUser[] => {
    const currentUserId = user?._id ? user._id.toString() : '';
    const seenList = Array.isArray(message.seenBy) ? message.seenBy : [];
    const readers: TypingUser[] = [];

    seenList.forEach((entry: any) => {
      let readerId: string | null = null;
      let readerName: string | undefined;
      let readerPicture: string | undefined;

      if (typeof entry === 'string') {
        readerId = entry;
      } else if (entry && typeof entry === 'object') {
        if ('_id' in entry) {
          readerId = entry._id?.toString();
          readerName = entry.name;
          readerPicture = entry.profilePicture;
        } else if ('user' in entry) {
          const userEntry: any = (entry as any).user;
          readerId = userEntry?._id?.toString() ?? null;
          readerName = userEntry?.name;
          readerPicture = userEntry?.profilePicture;
        }
      }

      if (!readerId || readerId === currentUserId) return;

      const info = participantInfoRef.current.get(readerId);
      readers.push({
        userId: readerId,
        name: info?.name || readerName || 'Participant',
        profilePicture: info?.profilePicture || readerPicture,
      });
    });

    return readers;
  };

  // Don't auto-select latest message - status text should only show on click

  return (
    <div 
      className="fixed bottom-4 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col z-[60] max-h-[700px] w-[420px]"
      style={{ right: `${16 + rightOffset}px` }}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-primary-50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <UserGroupIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-secondary-900 truncate">{roomName}</h4>
            {participants.length > 0 ? (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {participants.slice(0, 3).map((participant) => {
                  const participantId = participant?.user?._id;
                  if (!participantId) return null;
                  return (
                    <UserStatusBadge
                      key={participantId}
                      userId={participantId}
                      showText
                      className="text-gray-500"
                    />
                  );
                })}
                {participants.length > 3 && (
                  <span className="text-xs text-gray-500">+{participants.length - 3} more</span>
                )}
              </div>
            ) : (
              <span className="text-xs text-gray-500">Participants status unavailable</span>
            )}
            {typingUsers.length > 0 && (
              <p className="text-xs font-medium text-[#3D61D4]">Typing…</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/app/room/${roomId}`)}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="View Full"
          >
            <ArrowsPointingOutIcon className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => closeWidget(conversationId)}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0" style={{ maxHeight: '500px' }}>
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">No messages yet</div>
        ) : (
          messages.map((message) => {
          const isOwnMessage = message.sender._id === user?._id;
          const status = getMessageStatus(message);
          const messageId = typeof message._id === 'string' ? message._id : String(message._id);
          const isActive = activeMessageId === messageId;
          const isLatest = messageId === latestOwnMessageId;
          const isMostRecentlyRead = messageId === mostRecentlyReadMessageId;
          const readUsers = getReadUsersForMessage(message);

          return (
            <div
              key={message._id}
              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} items-end gap-2 ${isOwnMessage ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (!isOwnMessage) return;
                setActiveMessageId(prev => (prev === messageId ? null : messageId));
              }}
              role={isOwnMessage ? 'button' : undefined}
              tabIndex={isOwnMessage ? 0 : -1}
              onKeyDown={(e) => {
                if (!isOwnMessage) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveMessageId(prev => (prev === messageId ? null : messageId));
                }
              }}
            >
              {!isOwnMessage && (
                <img
                  src={getProfileImageUrl(message.sender.profilePicture) || '/default-avatar.png'}
                  alt={message.sender.name}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[75%]`}>
                <div className="text-xs text-gray-500 mb-0.5 px-1">
                  {!isOwnMessage && message.sender.name}
                </div>
                <div
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    isOwnMessage
                      ? 'bg-[#3D61D4] text-white rounded-br-sm'
                      : 'bg-gray-100 text-secondary-900 rounded-bl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  <div className={`flex items-center gap-1 mt-0.5 ${isOwnMessage ? 'text-primary-100' : 'text-gray-500'}`}>
                    <span className="text-[10px]">{formatTime(message.createdAt)}</span>
                  </div>
                </div>
                <MessageStatusRenderer
                  isOwnMessage={isOwnMessage}
                  status={status}
                  messageId={messageId}
                  isLatest={isLatest}
                  isMostRecentlyRead={isMostRecentlyRead}
                  isActive={isActive}
                  readIndicatorUsers={readUsers}
                />
              </div>
              {isOwnMessage && (
                <img
                  src={getProfileImageUrl(user?.profilePicture) || '/default-avatar.png'}
                  alt={user?.name}
                  className="h-5 w-5 rounded-full object-cover flex-shrink-0"
                />
              )}
            </div>
          );
          })
        )}
        <TypingActivityBar users={typingUsers} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              const hasText = e.target.value.trim().length > 0;
              const existingSelfTimer = typingTimeoutsRef.current.get('__self__');
              if (existingSelfTimer) {
                clearTimeout(existingSelfTimer);
                typingTimeoutsRef.current.delete('__self__');
              }
              if (hasText) {
                sendTyping(conversationId, true, user?.name);
                const timeoutId = setTimeout(() => {
                  sendTyping(conversationId, false, user?.name);
                  typingTimeoutsRef.current.delete('__self__');
                }, 1000);
                typingTimeoutsRef.current.set('__self__', timeoutId);
              } else {
                sendTyping(conversationId, false, user?.name);
              }
            }}
            onKeyDown={(e) => {
              const isMobile = isMobileDevice();
              
              if (e.key === 'Enter') {
                if (isMobile) {
                  // Mobile: Enter always inserts newline (default behavior)
                  // Do nothing, let default behavior handle it
                  return;
                } else {
                  // Desktop: Enter sends, Shift+Enter inserts newline
                  if (e.shiftKey) {
                    // Shift+Enter: Insert newline (default behavior)
                    return;
                  } else {
                    // Enter alone: Send message
                    e.preventDefault();
                    if (newMessage.trim() && !sending) {
                      handleSendMessage(e as any);
                    }
                  }
                }
              }
            }}
            onBlur={() => {
              const selfTimer = typingTimeoutsRef.current.get('__self__');
              if (selfTimer) {
                clearTimeout(selfTimer);
                typingTimeoutsRef.current.delete('__self__');
              }
              sendTyping(conversationId, false, user?.name);
            }}
            placeholder={isMobileDevice() ? "Type a message... (Enter for newline)" : "Type a message... (Enter to send, Shift+Enter for newline)"}
            disabled={sending}
            rows={1}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 resize-none overflow-y-auto"
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="bg-primary-600 text-white px-3 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            title={isMobileDevice() ? "Send message" : "Send message (Enter)"}
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default RoomChatWidget;


