import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { usePresence } from '../contexts/PresenceContext';
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
import { useChatSounds } from '../hooks/useChatSounds';

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
  const { getUserStatus } = usePresence();
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
  const rightOffset = widgetIndex * (320 + 16); // 320px width (w-80) + 16px gap - matching ChatWidget

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
        const isFromOtherUser = data.message.sender._id !== user?._id;
        const isViewingConversation = document.visibilityState === 'visible' && 
                                       window.__activeConversationId === conversationId;
        
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
        
        // Play message received sound if:
        // 1. Message is from another user (not self)
        // 2. User is viewing the conversation
        // 3. Tab is visible
        if (isFromOtherUser && isViewingConversation) {
          playMessageReceived().catch((err) => {
            const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
            console.warn('[RoomChatWidget] playMessageReceived failed:', error);
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
                console.error('[RoomChatWidget] Failed to mark as read:', error);
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
              console.warn('[RoomChatWidget] playMessageSent failed:', error);
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
          const wasTyping = previousTypingStateRef.current;
          const isViewingConversation = document.visibilityState === 'visible' && 
                                         window.__activeConversationId === conversationId;
          
          setTypingUsers(prev => {
            const existingIndex = prev.findIndex(u => u.userId === incomingUserId);
            const hasTypingUsers = existingIndex !== -1 ? prev.length > 0 : prev.length + 1 > 0;
            
            // Play typing sound when someone starts typing (once per typing session)
            if (!wasTyping && hasTypingUsers && isViewingConversation && !typingSoundPlayedRef.current) {
              typingSoundPlayedRef.current = true;
              playTyping().catch((err) => {
                const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
                console.warn('[RoomChatWidget] playTyping failed:', error);
              });
            }
            
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
            setTypingUsers(current => {
              const filtered = current.filter(u => u.userId !== incomingUserId);
              const hasRemainingUsers = filtered.length > 0;
              
              // Reset typing sound flag when all typing stops
              if (!hasRemainingUsers && previousTypingStateRef.current) {
                typingSoundPlayedRef.current = false;
              }
              previousTypingStateRef.current = hasRemainingUsers;
              
              return filtered;
            });
            typingTimeoutsRef.current.delete(incomingUserId);
          }, 1200);
          typingTimeoutsRef.current.set(incomingUserId, timeoutId);
          previousTypingStateRef.current = true;
        } else {
          // Instead of immediately removing, set a delay before removing the typing indicator
          const existingTimeout = typingTimeoutsRef.current.get(incomingUserId);
          if (existingTimeout) clearTimeout(existingTimeout);
          
          // Set timeout to remove typing indicator after a delay
          const timeoutId = setTimeout(() => {
            setTypingUsers(prev => {
              const filtered = prev.filter(u => u.userId !== incomingUserId);
              const hasRemainingUsers = filtered.length > 0;
              
              // Reset typing sound flag when all typing stops
              if (!hasRemainingUsers && previousTypingStateRef.current) {
                typingSoundPlayedRef.current = false;
              }
              previousTypingStateRef.current = hasRemainingUsers;
              
              return filtered;
            });
            typingTimeoutsRef.current.delete(incomingUserId);
          }, 1500); // 1.5 second delay before hiding typing indicator
          
          typingTimeoutsRef.current.set(incomingUserId, timeoutId);
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
              console.warn('[RoomChatWidget] playMessageRead failed:', error);
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
      typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
      setTypingUsers([]);
      sendTyping(conversationId, false, user?.name);
      leaveConversation(conversationId);
      leaveRoom(roomId);
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
  }, [conversationId, roomId, joinConversation, leaveConversation, joinRoom, leaveRoom, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, onTyping, ackMessageReceived, user?._id]);

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
                console.error('[RoomChatWidget] Failed to mark as read on auto-focus:', error);
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

  // Get online participants (aggregate status)
  const onlineParticipants = useMemo(() => {
    if (!participants.length) return [];
    const currentUserId = user?._id ? user._id.toString() : '';
    return participants
      .filter((p: any) => {
        const participantId = p?.user?._id ? p.user._id.toString() : null;
        if (!participantId || participantId === currentUserId) return false;
        const status = getUserStatus(participantId);
        return status.status === 'online';
      })
      .map((p: any) => ({
        _id: p.user._id,
        name: p.user.name,
        profilePicture: p.user.profilePicture,
      }))
      .slice(0, 3); // Show up to 3 online users
  }, [participants, user?._id, getUserStatus]);

  const onlineCount = useMemo(() => {
    if (!participants.length) return 0;
    const currentUserId = user?._id ? user._id.toString() : '';
    return participants.filter((p: any) => {
      const participantId = p?.user?._id ? p.user._id.toString() : null;
      if (!participantId || participantId === currentUserId) return false;
      const status = getUserStatus(participantId);
      return status.status === 'online';
    }).length;
  }, [participants, user?._id, getUserStatus]);

  const extraOnlineCount = Math.max(0, onlineCount - 3);

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
              console.error('[RoomChatWidget] Failed to mark as read:', error);
            }
            markReadTimeoutRef.current = null;
          }, 200); // 200ms debounce
        }
      }}
    >
      {/* Header - Matching ChatWidget layout */}
      <div className="p-3 border-b border-gray-200 dark:border-[var(--border-color)] flex items-center justify-between bg-primary-50 dark:bg-[var(--bg-hover)]">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-[var(--bg-panel)] flex items-center justify-center">
              <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-[var(--link-color)]" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate leading-tight">{roomName}</h4>
            <div className="mt-0.5">
              {onlineCount > 0 ? (
                <div className="flex items-center gap-1.5">
                  {/* Show up to 3 online user avatars */}
                  <div className="flex -space-x-1.5">
                    {onlineParticipants.map((participant) => (
                      <div key={participant._id} className="relative">
                        <img
                          src={getProfileImageUrl(participant.profilePicture) || '/default-avatar.png'}
                          alt={participant.name}
                          className="h-4 w-4 rounded-full border border-white object-cover"
                        />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white dark:border-[var(--bg-card)]"></div>
                      </div>
                    ))}
                  </div>
                  {extraOnlineCount > 0 && (
                    <span className="text-xs text-gray-500 dark:text-[var(--text-muted)]">
                      and {extraOnlineCount} more online
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-500 dark:text-[var(--text-muted)]">No one online</span>
              )}
            </div>
            {typingUsers.length > 0 && (
              <p className="text-xs font-medium text-[#3D61D4] animate-pulse mt-0.5">
                {typingUsers.length === 1 
                  ? 'Someone is typing…'
                  : typingUsers.length <= 4
                  ? `${typingUsers.length} people are typing…`
                  : '4+ people are typing…'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/app/room/${roomId}`)}
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

      {/* Messages - Matching ChatWidget max height */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 bg-white dark:bg-[var(--bg-card)]" style={{ maxHeight: '330px' }}>
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
                <div className="text-xs text-gray-500 dark:text-[var(--text-muted)] mb-0.5 px-1">
                  {!isOwnMessage && message.sender.name}
                </div>
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
                  readIndicatorUsers={readUsers}
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
                      console.error('[RoomChatWidget] Failed to mark as read:', error);
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
                      console.error('[RoomChatWidget] Failed to mark as read:', error);
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

export default RoomChatWidget;


