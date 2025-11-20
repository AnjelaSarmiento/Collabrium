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
} from '@heroicons/react/24/outline';
import axios from 'axios';
import UserStatusBadge from './UserStatusBadge';
import TypingActivityBar from './TypingActivityBar';
import { MessageStatusRenderer } from '../utils/messageStatusRenderer';
import { useAutosizeTextarea } from '../hooks/useAutosizeTextarea';
import { isMobileDevice } from '../utils/deviceDetection';
import { useChatSounds } from '../hooks/useChatSounds';

interface ChatWidgetProps {
  conversationId: string;
  otherUser: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
}

type TypingUser = {
  userId: string;
  name: string;
  profilePicture?: string;
};

const ChatWidget: React.FC<ChatWidgetProps> = ({ conversationId, otherUser }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { closeWidget, openWidgets } = useMessagesWidget();
  const { joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, ackMessageReceived, onTyping, sendTyping } = useSocket();
  const { playMessageSent, playMessageReceived, playTyping, playMessageRead } = useChatSounds({
    volume: 0.6,
  });
  
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, string>>({});
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const textareaRef = useAutosizeTextarea(newMessage, { minRows: 1, maxRows: 6, maxHeight: 160 });
  
  // Refs for sound tracking
  const sentSoundPlayedRef = useRef<Set<string>>(new Set());
  const readSoundPlayedRef = useRef<Set<string>>(new Set());
  const lastKnownReadStateRef = useRef<Map<string, Set<string>>>(new Map());
  const typingSoundPlayedRef = useRef<boolean>(false);
  const previousTypingStateRef = useRef<boolean>(false);
  
  // Refs for widget focus tracking
  const widgetRef = useRef<HTMLDivElement>(null);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const computeStatusForMessage = (message: any): string => {
    const senderId = message?.sender?._id?.toString();
    const currentUserId = user?._id?.toString();
    if (!senderId || senderId !== currentUserId) return '';

    if (Array.isArray(message?.seenBy) && message.seenBy.some((id: any) => id?.toString() === otherUser?._id)) {
      return 'Read';
    }
    if (Array.isArray(message?.deliveredTo) && message.deliveredTo.length > 0) {
      return 'Delivered';
    }
    return 'Sent';
  };
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate position based on widget index (if multiple widgets are open)
  const widgetIndex = openWidgets.findIndex(w => w.conversationId === conversationId);
  const rightOffset = widgetIndex * (320 + 16); // 320px width + 16px gap

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
      const isRead = seenBy.some((id: any) => {
        const idStr = typeof id === 'string' ? id : (id?.toString?.() || String(id));
        return idStr === otherUser?._id;
      });
      
      if (isRead) {
        return typeof msg._id === 'string' ? msg._id : String(msg._id);
      }
    }
    
    return null;
  }, [messages, user?._id, otherUser?._id]);

  useEffect(() => {
    if (!conversationId) return;

    console.log('[ChatWidget] Initializing for conversation:', conversationId);
    fetchMessages();
    joinConversation(conversationId);
    window.__activeConversationId = conversationId;

    const handleMessageNew = (data: { conversationId: string; message: any }) => {
      console.log('[ChatWidget] Received message:new event:', data);
      if (data.conversationId === conversationId) {
        const isFromOtherUser = data.message.sender._id !== user?._id;
        const isViewingConversation = document.visibilityState === 'visible' && 
                                       window.__activeConversationId === conversationId;
        
        setMessages(prev => {
          const next = [...prev];
          const index = next.findIndex(m => m._id === data.message._id);
          if (index !== -1) {
            next[index] = data.message;
          } else {
            console.log('[ChatWidget] Adding new message to list');
            next.push(data.message);
          }
          return next;
        });
        const status = computeStatusForMessage(data.message);
        if (status) {
          setMessageStatuses(prev => ({ ...prev, [data.message._id]: status }));
        }
        ackMessageReceived(conversationId, data.message._id);
        
        // Play message received sound if:
        // 1. Message is from another user (not self)
        // 2. User is viewing the conversation
        // 3. Tab is visible
        if (isFromOtherUser && isViewingConversation) {
          playMessageReceived().catch((err) => {
            const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
            console.warn('[ChatWidget] playMessageReceived failed:', error);
          });
        }
        
        // Only mark as read if input field is actually focused (explicit user interaction)
        // Do NOT mark as read just because widget is visible or mouse is hovering
        if (textareaRef.current && document.activeElement === textareaRef.current) {
          if (markReadTimeoutRef.current) {
            clearTimeout(markReadTimeoutRef.current);
          }
          markReadTimeoutRef.current = setTimeout(async () => {
            if (conversationId && textareaRef.current && document.activeElement === textareaRef.current) {
              try {
                await axios.post(`/messages/conversations/${conversationId}/read`);
                window.dispatchEvent(new CustomEvent('conversation:read'));
              } catch (error) {
                console.error('[ChatWidget] Failed to mark as read:', error);
              }
            }
            markReadTimeoutRef.current = null;
          }, 200); // 200ms debounce
        }
        
        // Don't auto-select message - status text should only show on click
        setTimeout(() => scrollToBottom(), 50);
      }
    };

    const handleMessageSent = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        const prevStatus = messageStatuses[data.messageId] || 'In progress...';
        const soundNotPlayed = !sentSoundPlayedRef.current.has(data.messageId);
        
        // Play sound ONLY on transition to "Sent" (not if already "Sent" or higher)
        const isTransitionToSent = prevStatus !== 'Sent' && 
                                    prevStatus !== 'Delivered' && 
                                    prevStatus !== 'Read';
        
        if (isTransitionToSent && soundNotPlayed) {
          sentSoundPlayedRef.current.add(data.messageId);
          
          // Play message sent sound if user is viewing the conversation and tab is visible
          if (document.visibilityState === 'visible' && 
              window.__activeConversationId === conversationId) {
            playMessageSent().catch((err) => {
              const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
              console.warn('[ChatWidget] playMessageSent failed:', error);
            });
          }
        }
        
        setMessageStatuses(prev => ({ ...prev, [data.messageId]: 'Sent' }));
      }
    };

    const handleMessageDelivered = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        setMessageStatuses(prev => ({ ...prev, [data.messageId]: 'Delivered' }));
      }
    };

    const handleTyping = (data: { conversationId: string; userId: string; userName: string; isTyping: boolean; timestamp?: string }) => {
      const incomingConversationId = data.conversationId;
      const incomingUserId = data.userId ? data.userId.toString() : '';
      const currentUserId = user?._id ? user._id.toString() : '';
      if (incomingConversationId === conversationId && incomingUserId && incomingUserId !== currentUserId) {
        if (data.isTyping) {
          setTypingUsers([
            {
              userId: incomingUserId,
              name: data.userName || otherUser.name,
              profilePicture: otherUser.profilePicture,
            },
          ]);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setTypingUsers([]);
            typingTimeoutRef.current = null;
          }, 1200);
          
          // Play typing sound when someone starts typing (once per typing session)
          const hasTypingUsers = true; // Someone is typing
          const wasTyping = previousTypingStateRef.current;
          const isViewingConversation = document.visibilityState === 'visible' && 
                                         window.__activeConversationId === conversationId;
          
          if (hasTypingUsers && !wasTyping && isViewingConversation && !typingSoundPlayedRef.current) {
            typingSoundPlayedRef.current = true;
            playTyping().catch((err) => {
              const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
              console.warn('[ChatWidget] playTyping failed:', error);
            });
          }
          previousTypingStateRef.current = true;
        } else {
          // Instead of immediately removing, set a delay before removing the typing indicator
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setTypingUsers([]);
            typingTimeoutRef.current = null;
            
            // Reset typing sound flag when typing stops
            const hasTypingUsers = false;
            if (!hasTypingUsers && previousTypingStateRef.current) {
              typingSoundPlayedRef.current = false;
            }
            previousTypingStateRef.current = false;
          }, 1500); // 1.5 second delay before hiding typing indicator
        }
      }
    };

    const handleMessageSeen = (data: { conversationId: string; userId: string; seq?: number; timestamp?: string; nodeId?: string }) => {
      if (data.conversationId !== conversationId) return;

      const readerId = data.userId ? data.userId.toString() : '';
      const currentUserId = user?._id ? user._id.toString() : '';
      if (!readerId || readerId === currentUserId) return;

      const isViewingConversation = document.visibilityState === 'visible' && 
                                     window.__activeConversationId === conversationId;

      setMessages(prev => {
        let hasUpdates = false;
        const newlyReadMessages: string[] = [];
        
        const nextMessages = prev.map(msg => {
          const senderId = msg?.sender?._id?.toString();
          if (senderId === currentUserId) {
            const seenList = Array.isArray(msg.seenBy) ? msg.seenBy : [];
            const seenSet = new Set(seenList.map((id: any) => (typeof id === 'object' && id !== null && 'toString' in id) ? id.toString() : String(id)));
            if (!seenSet.has(readerId)) {
              hasUpdates = true;
              seenSet.add(readerId);
              
              // Check if this is a new read event (sound hasn't been played yet)
              const previousReadBy = lastKnownReadStateRef.current.get(msg._id) || new Set<string>();
              const wasPreviouslyRead = previousReadBy.has(readerId);
              const isNewReadEvent = !wasPreviouslyRead;
              const soundAlreadyPlayed = readSoundPlayedRef.current.has(msg._id);
              
              if (isNewReadEvent && !soundAlreadyPlayed) {
                newlyReadMessages.push(msg._id);
              }
              
              // Update read state tracking
              const updatedReadBy = new Set(previousReadBy);
              updatedReadBy.add(readerId);
              lastKnownReadStateRef.current.set(msg._id, updatedReadBy);
              
              return { ...msg, seenBy: Array.from(seenSet) };
            }
          }
          return msg;
        });

        // Play message read sound for newly read messages
        if (newlyReadMessages.length > 0 && isViewingConversation) {
          newlyReadMessages.forEach(msgId => {
            readSoundPlayedRef.current.add(msgId);
            playMessageRead().catch((err) => {
              const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
              console.warn('[ChatWidget] playMessageRead failed:', error);
            });
          });
        }

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
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setTypingUsers([]);
      sendTyping(conversationId, false, user?.name);
      leaveConversation(conversationId);
      if (window.__activeConversationId === conversationId) {
        window.__activeConversationId = undefined;
      }
      // Clean up sound tracking refs
      sentSoundPlayedRef.current.clear();
      readSoundPlayedRef.current.clear();
      lastKnownReadStateRef.current.clear();
      typingSoundPlayedRef.current = false;
      previousTypingStateRef.current = false;
      // Clean up focus tracking refs
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
        markReadTimeoutRef.current = null;
      }
    };
  }, [conversationId, joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, onTyping, ackMessageReceived, user?._id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus textarea when widget opens (conversationId changes)
  useEffect(() => {
    if (conversationId && textareaRef.current) {
      // Small delay to ensure widget is rendered
      const timeoutId = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Mark as read when input is auto-focused (valid trigger per requirements)
          // Debounce to avoid race conditions
          if (markReadTimeoutRef.current) {
            clearTimeout(markReadTimeoutRef.current);
          }
          markReadTimeoutRef.current = setTimeout(async () => {
            if (conversationId && textareaRef.current && document.activeElement === textareaRef.current) {
              try {
                await axios.post(`/messages/conversations/${conversationId}/read`);
                window.dispatchEvent(new CustomEvent('conversation:read'));
              } catch (error) {
                console.error('[ChatWidget] Failed to mark as read on auto-focus:', error);
              }
            }
            markReadTimeoutRef.current = null;
          }, 200); // 200ms debounce
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [conversationId]);

  const fetchMessages = async () => {
    try {
      console.log('[ChatWidget] Fetching messages for conversation:', conversationId);
      const response = await axios.get(`/messages/conversations/${conversationId}/messages`);
      if (response.data.success) {
        const fetchedMessages = response.data.messages || [];
        console.log('[ChatWidget] Fetched messages:', fetchedMessages.length);
        setMessages(fetchedMessages);
        const statusMap: Record<string, string> = {};
        fetchedMessages.forEach((msg: any) => {
          const status = computeStatusForMessage(msg);
          if (status) {
            statusMap[msg._id] = status;
          }
        });
        setMessageStatuses(statusMap);
        // Mark as read
        try {
          await axios.post(`/messages/conversations/${conversationId}/read`);
          // Dispatch event to update navbar count
          window.dispatchEvent(new CustomEvent('conversation:read'));
        } catch (readError) {
          console.error('[ChatWidget] Failed to mark as read:', readError);
        }
        // Scroll to bottom after messages load
        setTimeout(() => scrollToBottom(), 100);
      } else {
        console.warn('[ChatWidget] API returned success: false');
      }
    } catch (error: any) {
      console.error('[ChatWidget] Failed to fetch messages:', error);
      if (error.response) {
        console.error('[ChatWidget] Response status:', error.response.status);
        console.error('[ChatWidget] Response data:', error.response.data);
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
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    sendTyping(conversationId, false, user?.name);

    try {
      console.log('[ChatWidget] Sending message:', messageContent);
      const response = await axios.post(`/messages/conversations/${conversationId}/messages`, {
        content: messageContent,
        attachments: []
      });
      console.log('[ChatWidget] Message sent successfully:', response.data);
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
      console.error('[ChatWidget] Error sending message:', error);
      if (error.response) {
        console.error('[ChatWidget] Response status:', error.response.status);
        console.error('[ChatWidget] Response data:', error.response.data);
      }
      setNewMessage(messageContent); // Restore on error
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


  // Don't auto-select latest message - status text should only show on click

  return (
    <div 
      ref={widgetRef}
      className="fixed bottom-4 bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-2xl border border-gray-200 dark:border-[var(--border-color)] flex flex-col z-[60] max-h-[500px] w-80"
      style={{ right: `${16 + rightOffset}px` }}
      onClick={async () => {
        // Auto-focus textarea when widget is clicked (Facebook Messenger behavior)
        if (textareaRef.current) {
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              // Focus event will trigger read marking via onFocus handler
            }
          }, 0);
        }
      }}
      onPointerDown={async () => {
        // Mark as read when user clicks/taps inside widget (valid trigger per requirements)
        if (conversationId && document.visibilityState === 'visible') {
          if (markReadTimeoutRef.current) {
            clearTimeout(markReadTimeoutRef.current);
          }
          markReadTimeoutRef.current = setTimeout(async () => {
            try {
              await axios.post(`/messages/conversations/${conversationId}/read`);
              window.dispatchEvent(new CustomEvent('conversation:read'));
            } catch (error) {
              console.error('[ChatWidget] Failed to mark as read:', error);
            }
            markReadTimeoutRef.current = null;
          }, 200); // 200ms debounce
        }
      }}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-[var(--border-color)] flex items-center justify-between bg-primary-50 dark:bg-[var(--bg-hover)]">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <img
              src={getProfileImageUrl(otherUser.profilePicture) || '/default-avatar.png'}
              alt={otherUser.name}
              className="h-8 w-8 rounded-full object-cover"
            />
            <UserStatusBadge 
              userId={otherUser._id} 
              showText={false}
              glow
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white dark:ring-[var(--bg-card)]"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate">{otherUser.name}</h4>
            <div className="mt-0.5">
              <UserStatusBadge userId={otherUser._id} showText={true} textOnly={true} />
            </div>
            {typingUsers.length > 0 && (
              <p className="text-xs font-medium text-[#3D61D4] animate-pulse mt-0.5">Typing…</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/app/messages?open=${conversationId}`)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-[var(--bg-panel)] rounded transition-colors"
            title="View Full"
          >
            <ArrowsPointingOutIcon className="h-4 w-4 text-gray-600 dark:text-[var(--icon-color)]" />
          </button>
          <button
            onClick={() => closeWidget(conversationId)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-[var(--bg-panel)] rounded transition-colors"
            title="Close"
          >
            <XMarkIcon className="h-4 w-4 text-gray-600 dark:text-[var(--icon-color)]" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0" style={{ maxHeight: '330px' }}>
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-[var(--text-muted)] text-sm py-8">No messages yet</div>
        ) : (
          messages.map((message) => {
          const isOwnMessage = message.sender._id === user?._id;
          const status = getMessageStatus(message);
          const messageId = typeof message._id === 'string' ? message._id : String(message._id);
          const isActive = activeMessageId === messageId;
          const isLatest = messageId === latestOwnMessageId;
          const isMostRecentlyRead = messageId === mostRecentlyReadMessageId;

          return (
            <div
              key={message._id}
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
              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} items-end gap-2 ${isOwnMessage ? 'cursor-pointer' : ''}`}
            >
              {!isOwnMessage && (
                <img
                  src={getProfileImageUrl(message.sender.profilePicture) || '/default-avatar.png'}
                  alt={message.sender.name}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[75%]`}>
                <div
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    isOwnMessage
                      ? 'bg-[#3D61D4] text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-[var(--bg-hover)] text-secondary-900 dark:text-[var(--text-primary)] rounded-bl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  <div className={`flex items-center gap-1 mt-0.5 ${isOwnMessage ? 'text-primary-100' : 'text-gray-500 dark:text-[var(--text-muted)]'}`}>
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
                  readIndicatorUser={otherUser}
                />
              </div>
            </div>
          );
          })
        )}
        <TypingActivityBar users={typingUsers} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 dark:border-[var(--border-color)] bg-gray-50 dark:bg-[var(--bg-panel)]">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              const hasText = e.target.value.trim().length > 0;
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
              }
              if (hasText) {
                sendTyping(conversationId, true, user?.name);
                typingTimeoutRef.current = setTimeout(() => {
                  sendTyping(conversationId, false, user?.name);
                  typingTimeoutRef.current = null;
                }, 1000);
              } else {
                sendTyping(conversationId, false, user?.name);
              }
              
              // Mark as read when user types into input (valid trigger per requirements)
              if (conversationId && document.visibilityState === 'visible') {
                if (markReadTimeoutRef.current) {
                  clearTimeout(markReadTimeoutRef.current);
                }
                markReadTimeoutRef.current = setTimeout(async () => {
                  if (textareaRef.current && document.activeElement === textareaRef.current) {
                    try {
                      await axios.post(`/messages/conversations/${conversationId}/read`);
                      window.dispatchEvent(new CustomEvent('conversation:read'));
                    } catch (error) {
                      console.error('[ChatWidget] Failed to mark as read:', error);
                    }
                  }
                  markReadTimeoutRef.current = null;
                }, 200); // 200ms debounce
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
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
              }
              sendTyping(conversationId, false, user?.name);
            }}
            placeholder={isMobileDevice() ? "Type a message... (Enter for newline)" : "Type a message... (Enter to send, Shift+Enter for newline)"}
            disabled={sending}
            rows={1}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-[var(--link-color)] disabled:opacity-50 resize-none overflow-y-auto"
            onFocus={async () => {
              // Mark as read when input field becomes focused (valid trigger per requirements)
              if (conversationId && document.visibilityState === 'visible') {
                if (markReadTimeoutRef.current) {
                  clearTimeout(markReadTimeoutRef.current);
                }
                markReadTimeoutRef.current = setTimeout(async () => {
                  if (textareaRef.current && document.activeElement === textareaRef.current) {
                    try {
                      await axios.post(`/messages/conversations/${conversationId}/read`);
                      window.dispatchEvent(new CustomEvent('conversation:read'));
                    } catch (error) {
                      console.error('[ChatWidget] Failed to mark as read:', error);
                    }
                  }
                  markReadTimeoutRef.current = null;
                }, 200); // 200ms debounce
              }
            }}
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

export default ChatWidget;


