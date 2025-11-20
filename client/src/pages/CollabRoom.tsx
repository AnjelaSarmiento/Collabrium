import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { usePresence } from '../contexts/PresenceContext';
import { getProfileImageUrl } from '../utils/image';
import axios from 'axios';
import VideoCall from '../components/VideoCall';
import CollabSidebar from '../components/collaboration/CollabSidebar';
import CreateMenu from '../components/collaboration/CreateMenu';
import UserStatusBadge from '../components/UserStatusBadge';
import TypingActivityBar from '../components/TypingActivityBar';
import { MessageStatusRenderer } from '../utils/messageStatusRenderer';
import { useAutosizeTextarea } from '../hooks/useAutosizeTextarea';
import { isMobileDevice } from '../utils/deviceDetection';
import { useChatSounds } from '../hooks/useChatSounds';
import {
  PaperAirplaneIcon,
  PaperClipIcon,
  VideoCameraIcon,
  CheckIcon,
  UserGroupIcon,
  ClockIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  BellSlashIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface Room {
  _id: string;
  name: string;
  description: string;
  postId: {
    _id: string;
    title: string;
    type: string;
    reward?: number;
  };
  creator: {
    _id: string;
    name: string;
    profilePicture: string;
  };
  participants: Array<{
    user: {
      _id: string;
      name: string;
      profilePicture: string;
    };
    role: string;
    joinedAt: string;
  }>;
  chatMessages: Array<{
    _id: string;
    sender: {
      _id: string;
      name: string;
      profilePicture: string;
    };
    content: string;
    messageType: string;
    createdAt: string;
  }>;
  sharedFiles: Array<{
    _id: string;
    filename: string;
    url: string;
    fileType: string;
    uploadedBy: {
      _id: string;
      name: string;
    };
    uploadedAt: string;
  }>;
  tasks: Array<{
    _id: string;
    title: string;
    description: string;
    assignedTo?: {
      _id: string;
      name: string;
    };
    status: string;
    priority: string;
    createdAt: string;
  }>;
  status: string;
  sessionStart: string;
  totalDuration: number;
}

interface ChatMessage {
  sender: string;
  content: string;
  messageType: string;
  attachments?: any[];
}

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
  isRoomParticipant?: boolean;
}

type TypingParticipant = {
  userId: string;
  name: string;
  profilePicture?: string;
};

const CollabRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { socket, joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, ackMessageReceived, onTyping, sendTyping, joinRoom, leaveRoom } = useSocket();
  const { getUserStatus } = usePresence();
  const { playMessageSent, playMessageReceived, playTyping, playMessageRead } = useChatSounds({
    volume: 0.6,
  });
  const navigate = useNavigate();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, string>>({});
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const textareaRef = useAutosizeTextarea(newMessage, { minRows: 1, maxRows: 6, maxHeight: 160 });
  const [typingUsers, setTypingUsers] = useState<TypingParticipant[]>([]);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const typingSoundPlayedRef = useRef<boolean>(false);
  const previousTypingStateRef = useRef<boolean>(false);
  const sentSoundPlayedRef = useRef<Set<string>>(new Set());
  const readSoundPlayedRef = useRef<Set<string>>(new Set());
  const lastKnownReadStateRef = useRef<Map<string, Set<string>>>(new Map());
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Collapsed by default
  const [inboxCollapsed, setInboxCollapsed] = useState(false); // Expanded by default
  const [showMobileInbox, setShowMobileInbox] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  
  // Conversation list state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [conversationsLoading, setConversationsLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantsRef = useRef<Room['participants']>([] as Room['participants']);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set()); // Track messages already marked as read by this client
  const lastReadEmitRef = useRef<Map<string, number>>(new Map()); // Track last read emit time per conversation (prevent duplicate emits)
  const isComponentMountedRef = useRef<boolean>(true);

  useEffect(() => {
    participantsRef.current = room?.participants ?? [];
  }, [room?.participants]);

  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
    };
  }, []);

  // Fetch conversations list
  // silent: if true, don't show loading state (for background refreshes)
  const fetchConversations = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setConversationsLoading(true);
      }
      const response = await axios.get('/messages/conversations');
      if (response.data.success) {
        const fetchedConversations = response.data.conversations || [];
        console.log('[CollabRoom] Fetched conversations:', fetchedConversations.length, silent ? '(silent)' : '');
        
        // Merge with existing conversations to preserve optimistic updates
        // Only update conversations that haven't been optimistically updated recently
        setConversations(prev => {
          // Create a map of existing conversations for quick lookup
          const existingMap = new Map(prev.map(c => [c._id, c]));
          
          // Merge fetched conversations with existing ones
          const merged = fetchedConversations.map((fetched: Conversation) => {
            const existing = existingMap.get(fetched._id);
            
            // If we have an existing conversation, check if optimistic update is newer
            if (existing) {
              const existingTime = new Date(existing.lastMessageAt || 0).getTime();
              const fetchedTime = new Date(fetched.lastMessageAt || 0).getTime();
              
              // If existing has more recent message (optimistic update), keep it
              if (existingTime > fetchedTime) {
                return existing;
              }
              
              // If timestamps are equal, check if existing has a newer message ID
              // (optimistic updates happen immediately, so they might have same timestamp)
              if (existingTime === fetchedTime && existing.lastMessage?._id && fetched.lastMessage?._id) {
                if (existing.lastMessage._id === fetched.lastMessage._id) {
                  // Same message - merge: use fetched but preserve optimistic unreadCount
                  const isCurrentlyViewing = (selectedConversation?._id || conversationId) === fetched._id;
                  return {
                    ...fetched,
                    unreadCount: isCurrentlyViewing ? 0 : (existing.unreadCount !== undefined ? existing.unreadCount : fetched.unreadCount),
                  };
                }
                // Different messages - use fetched (server is source of truth)
              }
              
              // Use fetched data but preserve optimistic unreadCount if viewing
              const isCurrentlyViewing = (selectedConversation?._id || conversationId) === fetched._id;
              return {
                ...fetched,
                // Preserve optimistic unreadCount: 0 if currently viewing, otherwise use existing if it's higher
                unreadCount: isCurrentlyViewing ? 0 : (existing.unreadCount > fetched.unreadCount ? existing.unreadCount : fetched.unreadCount),
              };
            }
            
            return fetched;
          });
          
          // Sort by lastMessageAt
          merged.sort((a: Conversation, b: Conversation) => {
            const timeA = new Date(a.lastMessageAt || 0).getTime();
            const timeB = new Date(b.lastMessageAt || 0).getTime();
            return timeB - timeA;
          });
          
          // Calculate total unread count and dispatch event to update Navbar badge
          const totalUnread = merged.reduce((sum: number, conv: Conversation) => sum + (conv.unreadCount || 0), 0);
          window.dispatchEvent(new CustomEvent('messages:count-update', { 
            detail: { totalUnread } 
          }));
          
          return merged;
        });
        
        // Auto-select room conversation if we're in a room and haven't selected one yet
        if (roomId && conversationId && !selectedConversation) {
          const roomConv = fetchedConversations.find((c: Conversation) => 
            c.isRoom && c.roomId === roomId
          );
          if (roomConv) {
            setSelectedConversation(roomConv);
          }
        }
      } else {
        console.warn('[CollabRoom] API returned success: false');
      }
    } catch (error: any) {
      console.error('[CollabRoom] Failed to fetch conversations:', error);
      if (error.response) {
        console.error('[CollabRoom] Response status:', error.response.status);
        console.error('[CollabRoom] Response data:', error.response.data);
      }
    } finally {
      if (!silent) {
      setConversationsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (user) {
    fetchConversations();
    }
  }, [user]);

  // Auto-select room conversation when roomId and conversationId are available
  useEffect(() => {
    if (roomId && conversationId && conversations.length > 0 && !selectedConversation) {
      const roomConv = conversations.find((c: Conversation) => 
        c.isRoom && c.roomId === roomId
      );
      if (roomConv) {
        setSelectedConversation(roomConv);
      }
    }
  }, [roomId, conversationId, conversations, selectedConversation]);

  // Listen for conversation updates
  useEffect(() => {
    if (!socket) return;
    
    const handleConversationUpdate = () => {
      console.log('[CollabRoom] Conversation update event received - silently refreshing conversations');
      // Silent refresh - don't show loading state
      fetchConversations(true);
    };
    
    // Only listen to conversation:update events, not conversation:read
    // conversation:read fires too frequently during scrolling and doesn't require
    // a full conversation list refresh - only unread counts would change
    socket.on('conversation:update', handleConversationUpdate);
    
    return () => {
      socket.off('conversation:update', handleConversationUpdate);
    };
  }, [socket]);
  
  // Periodically refresh conversations list (e.g., every 30 seconds) to update unread counts
  // This is less aggressive than refreshing on every scroll/read event
  // Use a ref to store the latest fetchConversations function to avoid recreating interval
  const fetchConversationsRef = useRef(fetchConversations);
  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);
  
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Silent refresh - don't show loading state for background updates
      fetchConversationsRef.current(true);
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (roomId) {
      fetchRoomAndConversation();
      // Join room socket for collaboration events
      joinRoom(roomId);
    }

    return () => {
      // Stop camera/mic streams on unmount
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      // Clear active conversation ID
      if (window.__activeConversationId === conversationId) {
        window.__activeConversationId = undefined;
      }
      
      if (conversationId) {
        leaveConversation(conversationId);
      }
      
      if (roomId) {
        leaveRoom(roomId);
      }
    };
  }, [roomId, conversationId, joinRoom, leaveRoom, leaveConversation]);

  // Handle conversation selection
  const handleSelectConversation = (conv: Conversation) => {
    // Optimistically reset unread count to 0 when selecting conversation
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
    
    // If it's a room conversation and we're already in that room, just switch chat
    if (conv.isRoom && conv.roomId === roomId) {
      setSelectedConversation(conv);
      if (conv.roomId && conversationId) {
        // We're already in this room, just update selected conversation
        return;
      }
    }
    
    // If it's a different room, navigate to it
    if (conv.isRoom && conv.roomId && conv.roomId !== roomId) {
      navigate(`/app/room/${conv.roomId}`);
      return;
    }
    
    // For DM conversations, switch the chat thread
    if (!conv.isRoom) {
      setSelectedConversation(conv);
      // Switch to DM conversation
      const newConversationId = conv._id;
      if (conversationId && conversationId !== newConversationId) {
        leaveConversation(conversationId);
      }
      setConversationId(newConversationId);
      window.__activeConversationId = newConversationId;
      joinConversation(newConversationId);
      fetchMessagesForConversation(newConversationId);
      // Mark as read
      axios.post(`/messages/conversations/${newConversationId}/read`).catch(console.error);
    }
  };

  // Fetch messages for a specific conversation
  const fetchMessagesForConversation = async (convId: string) => {
    try {
      const response = await axios.get(`/messages/conversations/${convId}/messages`);
      if (response.data.success) {
        setMessages(response.data.messages || []);
        scrollToBottom();
      }
    } catch (error) {
      console.error('[CollabRoom] Failed to fetch messages:', error);
    }
  };

  // Check if user is scrolled to bottom (within 100px threshold)
  const isScrolledToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return false;
    const container = messagesContainerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const threshold = 100; // 100px threshold
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Check if should mark messages as read for full view
  const shouldMarkReadForFullView = useCallback((convId: string): boolean => {
    if (!convId || !isComponentMountedRef.current) {
      console.log('[CollabRoom] shouldMarkReadForFullView: false - no convId or component unmounted');
      return false;
    }

    // 1. Check tab visibility
    const isTabVisible = document.visibilityState === 'visible';
    if (!isTabVisible) {
      console.log('[CollabRoom] shouldMarkReadForFullView: false - tab not visible');
      return false;
    }

    // 2. Check window focus
    const isWindowFocused = document.hasFocus ? document.hasFocus() : true;
    if (!isWindowFocused) {
      console.log('[CollabRoom] shouldMarkReadForFullView: false - window not focused');
      return false;
    }

    // 3. Check if conversation is active
    const activeConvId = selectedConversation?._id || conversationId;
    if (activeConvId !== convId) {
      console.log('[CollabRoom] shouldMarkReadForFullView: false - conversation not active', { activeConvId, convId });
      return false;
    }

    // 4. Check if scrolled to bottom
    const isAtBottom = isScrolledToBottom();
    if (!isAtBottom) {
      console.log('[CollabRoom] shouldMarkReadForFullView: false - not scrolled to bottom');
      return false;
    }

    console.log('[CollabRoom] shouldMarkReadForFullView: true - all conditions met');
    return true;
  }, [isScrolledToBottom, selectedConversation, conversationId]);

  // Direct mark as read (bypasses scroll check) - used for new messages when user is actively viewing
  const markAsReadDirectly = useCallback(async (convId: string, messageId?: string) => {
    if (!convId) {
      console.log('[CollabRoom] markAsReadDirectly: skipped - no convId');
      return;
    }

    // Basic checks: tab visible, window focused, conversation active
    const isTabVisible = document.visibilityState === 'visible';
    const isWindowFocused = document.hasFocus ? document.hasFocus() : true;
    const activeConvId = selectedConversation?._id || conversationId;
    const isConversationActive = activeConvId === convId;

    if (!isTabVisible || !isWindowFocused || !isConversationActive) {
      console.log('[CollabRoom] markAsReadDirectly: skipped - basic conditions not met', {
        isTabVisible,
        isWindowFocused,
        isConversationActive
      });
      return;
    }

    // Prevent duplicate emissions - debounce per conversation (max once per 500ms)
    const now = Date.now();
    const lastEmitTime = lastReadEmitRef.current.get(convId) || 0;
    const timeSinceLastEmit = now - lastEmitTime;
    const DEBOUNCE_MS = 500; // 500ms debounce to prevent duplicate emits

    if (timeSinceLastEmit < DEBOUNCE_MS) {
      console.log('[CollabRoom] ⏭️ Skipping read emit - too soon since last emit:', {
        conversationId: convId,
        timeSinceLastEmit,
        debounceMs: DEBOUNCE_MS
      });
      return;
    }

    // Update last emit time immediately to prevent race conditions
    lastReadEmitRef.current.set(convId, now);

    // Emit read immediately
    try {
      const timestamp = new Date().toISOString();
      console.log('[CollabRoom] 📤 [DIRECT READ] Sending read event to server (bypassing scroll check):', {
        conversationId: convId,
        messageId,
        userId: user?._id,
        timestamp
      });
      
      const response = await axios.post(`/messages/conversations/${convId}/read`);
      
      if (response.data.success) {
        console.log('[CollabRoom] ✅ [DIRECT READ SUCCESS] Read event successfully sent to server:', {
          conversationId: convId,
          messageId,
          userId: user?._id,
          timestamp
        });
        
        // Update conversation list optimistically - reset unread count to 0
        setConversations(prev => prev.map(c => {
          if (c._id === convId) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        }));
        
        // Dispatch event to update other components (like navbar)
        window.dispatchEvent(new CustomEvent('conversation:read'));
        // Note: Server will broadcast message:seen event to all clients
      } else {
        console.warn('[CollabRoom] ⚠️ [DIRECT READ WARNING] Server returned success:false:', response.data);
        // Reset last emit time on failure so we can retry
        lastReadEmitRef.current.delete(convId);
      }
    } catch (error: any) {
      console.error('[CollabRoom] ❌ [DIRECT READ ERROR] Failed to mark messages as read:', {
        conversationId: convId,
        messageId,
        userId: user?._id,
        error: error?.response?.data || error?.message || error,
        status: error?.response?.status,
        timestamp: new Date().toISOString()
      });
      // Reset last emit time on error so we can retry
      lastReadEmitRef.current.delete(convId);
    }
  }, [selectedConversation, conversationId, user?._id]);

  // Mark as read when scrolled to bottom and tab is visible (full view auto-mark)
  // This is used for scroll events and older messages - requires scroll-to-bottom check
  const markAsReadIfScrolledToBottom = useCallback(async (convId: string) => {
    if (!convId) {
      console.log('[CollabRoom] markAsReadIfScrolledToBottom: skipped - no convId');
      return;
    }

    // Check if should mark as read (includes scroll-to-bottom check)
    if (!shouldMarkReadForFullView(convId)) {
      console.log('[CollabRoom] markAsReadIfScrolledToBottom: skipped - conditions not met');
      return;
    }

    // Prevent duplicate emissions - debounce per conversation (max once per 500ms)
    const now = Date.now();
    const lastEmitTime = lastReadEmitRef.current.get(convId) || 0;
    const timeSinceLastEmit = now - lastEmitTime;
    const DEBOUNCE_MS = 500; // 500ms debounce to prevent duplicate emits

    if (timeSinceLastEmit < DEBOUNCE_MS) {
      console.log('[CollabRoom] ⏭️ Skipping read emit - too soon since last emit:', {
        conversationId: convId,
        timeSinceLastEmit,
        debounceMs: DEBOUNCE_MS
      });
      return;
    }

    // Clear any pending timeout
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
      markReadTimeoutRef.current = null;
    }

    // Update last emit time immediately to prevent race conditions
    lastReadEmitRef.current.set(convId, now);

    // Emit read immediately when conditions are met
    try {
      const timestamp = new Date().toISOString();
      console.log('[CollabRoom] 📤 [CLIENT EMIT] Sending read event to server:', {
        conversationId: convId,
        userId: user?._id,
        timestamp,
        conditions: {
          tabVisible: document.visibilityState === 'visible',
          windowFocused: document.hasFocus ? document.hasFocus() : true,
          scrolledToBottom: isScrolledToBottom(),
          componentMounted: isComponentMountedRef.current
        }
      });
      
      const response = await axios.post(`/messages/conversations/${convId}/read`);
      
      if (response.data.success) {
        console.log('[CollabRoom] ✅ [CLIENT EMIT SUCCESS] Read event successfully sent to server:', {
          conversationId: convId,
          userId: user?._id,
          timestamp,
          serverResponse: response.data
        });
        
        // Update conversation list optimistically - reset unread count to 0
        setConversations(prev => prev.map(c => {
          if (c._id === convId) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        }));
        
        // Dispatch event to update other components (like navbar)
        window.dispatchEvent(new CustomEvent('conversation:read'));
        // Note: Server will broadcast message:seen event to all clients
      } else {
        console.warn('[CollabRoom] ⚠️ [CLIENT EMIT WARNING] Server returned success:false:', response.data);
        // Reset last emit time on failure so we can retry
        lastReadEmitRef.current.delete(convId);
      }
    } catch (error: any) {
      console.error('[CollabRoom] ❌ [CLIENT EMIT ERROR] Failed to mark messages as read:', {
        conversationId: convId,
        userId: user?._id,
        error: error?.response?.data || error?.message || error,
        status: error?.response?.status,
        timestamp: new Date().toISOString()
      });
      // Reset last emit time on error so we can retry
      lastReadEmitRef.current.delete(convId);
    }
  }, [shouldMarkReadForFullView, isScrolledToBottom, user?._id]);

  useEffect(() => {
    const activeConvId = selectedConversation?._id || conversationId;
    if (activeConvId) {
      // Set active conversation ID so notification system knows user is viewing this conversation
      window.__activeConversationId = activeConvId;
      
      if (selectedConversation?.isRoom && roomId) {
        // Room conversation - use existing room conversationId
        if (conversationId) {
          fetchMessages();
          joinConversation(conversationId);
        }
      } else if (selectedConversation && !selectedConversation.isRoom) {
        // DM conversation
        fetchMessagesForConversation(activeConvId);
        joinConversation(activeConvId);
      } else if (conversationId) {
        // Default to room conversation
        fetchMessages();
        joinConversation(conversationId);
      }
      
      // Listen for new messages from ALL conversations (not just active)
      // This ensures the conversation list updates in real-time
      const handleMessageNew = (data: { conversationId: string; message: any }) => {
        const messageConvId = data.conversationId;
        const isCurrentConversation = messageConvId === activeConvId;
          const isFromOtherUser = data.message.sender._id !== user?._id;
        const messageId = data.message._id;
        
        // Update conversation list optimistically for ALL conversations
        setConversations(prev => {
          const conversationIndex = prev.findIndex(c => c._id === messageConvId);
          
          if (conversationIndex === -1) {
            // Conversation not in list yet - might be a new conversation
            // Silently fetch conversations to get the new one, but don't show loading
            fetchConversations(true).catch(console.error);
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
          updated.sort((a, b) => {
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
        
        // Handle message display for current conversation
        if (isCurrentConversation) {
          const isViewingConversation = document.visibilityState === 'visible' && 
                                         window.__activeConversationId === activeConvId;
          
          console.log('[CollabRoom] 📨 Message received:', { messageId, conversationId: activeConvId, isFromOtherUser });
          
          // Check if user is actively viewing BEFORE adding message to DOM
          const isTabVisible = document.visibilityState === 'visible';
          const isWindowFocused = document.hasFocus ? document.hasFocus() : true;
          const isConversationActive = window.__activeConversationId === activeConvId;
          
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m._id === messageId)) return prev;
            return [...prev, data.message];
          });
          ackMessageReceived(activeConvId, data.message._id);
          scrollToBottom();
          
          // Play message received sound if:
          // 1. Message is from another user (not self)
          // 2. User is viewing the conversation
          // 3. Tab is visible
          if (isFromOtherUser && isViewingConversation) {
            playMessageReceived().catch((err) => {
              const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
              console.warn('[CollabRoom] playMessageReceived failed:', error);
            });
          }
          
          // Full message view: Auto-mark NEW messages as read immediately if user is actively viewing
          // For new messages: NO scroll-to-bottom check required (they auto-scroll and user will see them)
          // This matches Messenger behavior - instant read receipts for new messages when actively viewing
          if (!readMessageIdsRef.current.has(messageId)) {
            console.log('[CollabRoom] 📖 Evaluating read conditions for new message:', { 
                messageId, 
                conversationId: activeConvId,
              isTabVisible,
              isWindowFocused,
              isConversationActive
            });
            
            // For NEW messages: If user is actively viewing (tab visible, window focused, conversation active),
            // mark as read immediately - no scroll-to-bottom check needed
            // New messages auto-scroll to bottom, so if user is viewing, they'll see it
            if (isTabVisible && isWindowFocused && isConversationActive) {
              // Mark as read after a short delay to ensure message is added to DOM
              // Use a delay to ensure scrollToBottom() has started and message is visible
              setTimeout(() => {
                // Double-check conditions and that we haven't already marked
                if (!readMessageIdsRef.current.has(messageId) && 
                    document.visibilityState === 'visible' && 
                    document.hasFocus && document.hasFocus() &&
                    window.__activeConversationId === activeConvId) {
                  
                  console.log('[CollabRoom] ✅ [NEW MESSAGE] User actively viewing - marking as read immediately:', { 
                    messageId, 
                    conversationId: activeConvId,
                    timestamp: new Date().toISOString(),
                    reason: 'User is actively viewing conversation - new message will be visible'
                  });
                  
                  // Mark as read directly - bypass scroll-to-bottom check for new messages
                  // User is actively viewing, so they'll see the new message immediately
                  markAsReadDirectly(activeConvId, messageId);
                    readMessageIdsRef.current.add(messageId);
                    console.log('[CollabRoom] 📝 Added messageId to read tracking:', messageId);
                  } else {
                  console.log('[CollabRoom] ⏭️ Conditions changed or already marked:', {
                    messageId,
                    isViewing: document.visibilityState === 'visible' && window.__activeConversationId === activeConvId,
                    isFocused: document.hasFocus ? document.hasFocus() : true,
                    alreadyMarked: readMessageIdsRef.current.has(messageId)
                  });
                  }
              }, 200); // 200ms delay to ensure message is added to DOM and scroll starts
                } else {
              console.log('[CollabRoom] ⏸️ User not actively viewing - will not mark new message as read:', {
                isTabVisible,
                isWindowFocused,
                isConversationActive
              });
            }
          } else {
            console.log('[CollabRoom] ⏭️ Skipping read - message already marked:', messageId);
          }
        } else {
          // Message for another conversation - just acknowledge receipt
          ackMessageReceived(messageConvId, data.message._id);
        }
      };
      
      // Listen for message sent status
      const handleMessageSent = (data: { conversationId: string; messageId: string }) => {
        if (data.conversationId === activeConvId) {
          const prevStatus = messageStatuses[data.messageId] || 'In progress...';
          const soundNotPlayed = !sentSoundPlayedRef.current.has(data.messageId);
          
          // Play sound ONLY on transition to "Sent" (not if already "Sent" or higher)
          const isTransitionToSent = prevStatus !== 'Sent' && 
                                      prevStatus !== 'Delivered' && 
                                      prevStatus !== 'Read';
          
          if (isTransitionToSent && soundNotPlayed) {
            sentSoundPlayedRef.current.add(data.messageId);
            playMessageSent().catch((err) => {
              const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
              console.warn('[CollabRoom] playMessageSent failed:', error);
            });
          }
          
          setMessageStatuses(prev => ({
            ...prev,
            [data.messageId]: 'Sent'
          }));
        }
      };
      
      // Listen for message delivered status
      const handleMessageDelivered = (data: { conversationId: string; messageId: string }) => {
        if (data.conversationId === activeConvId) {
          setMessageStatuses(prev => ({
            ...prev,
            [data.messageId]: 'Delivered'
          }));
        }
      };
      
      // Listen for typing indicators
      const handleTyping = (data: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => {
        if (data.conversationId === activeConvId) {
          const incomingUserId = data.userId ? data.userId.toString() : '';
          const currentUserId = user?._id ? user._id.toString() : '';
          if (incomingUserId && incomingUserId !== currentUserId) {
            const participants = participantsRef.current || [];
            const match = participants.find(p => p.user?._id?.toString() === incomingUserId);
            const typingParticipant: TypingParticipant = {
              userId: incomingUserId,
              name: match?.user?.name || data.userName || 'User',
              profilePicture: match?.user?.profilePicture,
            };

            const wasTyping = typingUsers.some(u => u.userId === incomingUserId);
            const isViewingConversation = document.visibilityState === 'visible' && 
                                           window.__activeConversationId === activeConvId;

            if (data.isTyping) {
              setTypingUsers(prev => {
                const existingIndex = prev.findIndex(u => u.userId === incomingUserId);
                if (existingIndex !== -1) {
                  const next = [...prev];
                  next[existingIndex] = typingParticipant;
                  return next;
                }
                return [...prev, typingParticipant];
              });

              const existingTimeout = typingTimeoutsRef.current.get(incomingUserId);
              if (existingTimeout) clearTimeout(existingTimeout);

              const timeoutId = setTimeout(() => {
                setTypingUsers(current => current.filter(u => u.userId !== incomingUserId));
                typingTimeoutsRef.current.delete(incomingUserId);
              }, 1200);

              typingTimeoutsRef.current.set(incomingUserId, timeoutId);
              
              // Play typing sound when someone starts typing (once per typing session)
              const hasTypingUsers = typingUsers.length > 0 || !wasTyping;
              if (hasTypingUsers && !previousTypingStateRef.current && isViewingConversation && !typingSoundPlayedRef.current) {
                typingSoundPlayedRef.current = true;
                playTyping().catch((err) => {
                  const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
                  console.warn('[CollabRoom] playTyping failed:', error);
                });
              }
              previousTypingStateRef.current = true;
            } else {
              // Instead of immediately removing, set a delay before removing the typing indicator
              const existingTimeout = typingTimeoutsRef.current.get(incomingUserId);
              if (existingTimeout) clearTimeout(existingTimeout);
              
              // Set timeout to remove typing indicator after a delay
              const timeoutId = setTimeout(() => {
                setTypingUsers(current => {
                  const filtered = current.filter(u => u.userId !== incomingUserId);
                  // Reset typing sound flag when all users stop typing
                  if (filtered.length === 0) {
                    typingSoundPlayedRef.current = false;
                    previousTypingStateRef.current = false;
                  }
                  return filtered;
                });
                typingTimeoutsRef.current.delete(incomingUserId);
              }, 1500); // 1.5 second delay before hiding typing indicator
              
              typingTimeoutsRef.current.set(incomingUserId, timeoutId);
            }
          }
        }
      };
      
      // Listen for message seen/read events (server broadcast)
      const handleMessageSeen = (payload: { conversationId: string; userId: string; messageId?: string; seq?: number; timestamp?: string; nodeId?: string }) => {
        const eventTimestamp = new Date().toISOString();
        console.log('[CollabRoom] 📖 [SERVER BROADCAST RECEIVED] message:seen event received:', { 
          conversationId: payload.conversationId, 
          userId: payload.userId, 
          messageId: payload.messageId,
          seq: payload.seq,
          timestamp: payload.timestamp,
          nodeId: payload.nodeId,
          activeConvId,
          eventReceivedAt: eventTimestamp
        });
        
        if (payload.conversationId === activeConvId) {
          const readerUserId = payload.userId;
          const messageId = payload.messageId;
          
          // Normalize readerUserId to string
          const readerIdStr = typeof readerUserId === 'string' ? readerUserId : String(readerUserId);
          const currentUserIdStr = user?._id ? String(user._id) : '';
          
          // Skip if this is our own read event (we already know about it)
          if (readerIdStr === currentUserIdStr) {
            console.log('[CollabRoom] ⏭️ Ignoring own read event');
            return;
          }
          
          console.log('[CollabRoom] 📖 [PROCESSING BROADCAST] Processing read event for conversation:', {
            activeConvId,
            readerUserId: readerIdStr,
            messageId,
            currentUserId: currentUserIdStr
          });
          
          // Update messages state to reflect read status
          setMessages(prev => {
            let hasUpdates = false;
            const updated = prev.map(msg => {
              // If specific messageId provided, only update that message
              if (messageId && msg._id !== messageId) {
                return msg;
              }
              
              // Only update own messages (messages sent by current user)
              if (msg.sender._id !== user?._id) {
                return msg;
              }
              
              // Check if this user already marked as read
              const seenBy = msg.seenBy || [];
              const alreadySeen = seenBy.some((id: any) => {
                const idStr = typeof id === 'string' ? id : (id?.toString?.() || String(id));
                return idStr === readerIdStr;
              });
              
              if (!alreadySeen) {
                hasUpdates = true;
                // Add reader to seenBy array
                const updatedSeenBy = [...seenBy, readerUserId];
                
                console.log('[CollabRoom] ✅ [STATE UPDATE] Marking message as read:', {
                  messageId: msg._id,
                  readerUserId: readerIdStr,
                  previousSeenBy: seenBy,
                  updatedSeenBy
                });
                
                // Play read sound if this is the current user's message and user is viewing
                const isViewingConversation = document.visibilityState === 'visible' && 
                                               window.__activeConversationId === activeConvId;
                const soundNotPlayed = !readSoundPlayedRef.current.has(msg._id);
                
                if (isViewingConversation && soundNotPlayed) {
                  readSoundPlayedRef.current.add(msg._id);
                  console.log('[CollabRoom] 🎵 Playing read sound for message:', msg._id);
                  playMessageRead().catch((err) => {
                    const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
                    console.warn('[CollabRoom] playMessageRead failed:', error);
                  });
                }
                
                return {
                  ...msg,
                  seenBy: updatedSeenBy
                };
              }
              
              return msg;
            });
            
            if (hasUpdates) {
              console.log('[CollabRoom] ✅ [STATE UPDATE COMPLETE] Updated messages state with read status:', {
                conversationId: activeConvId,
                readerUserId: readerIdStr,
                messagesUpdated: updated.filter(msg => {
                  if (msg.sender._id !== user?._id) return false;
                  const seenBy = msg.seenBy || [];
                  return seenBy.some((id: any) => {
                    const idStr = typeof id === 'string' ? id : (id?.toString?.() || String(id));
                    return idStr === readerIdStr;
                  });
                }).length
              });
            } else {
              console.log('[CollabRoom] ⏭️ [STATE UPDATE SKIP] No updates needed - messages already marked as read');
            }
            
            return updated;
          });
        } else {
          console.log('[CollabRoom] ⏭️ [BROADCAST IGNORED] Ignoring read event - different conversation:', {
            payloadConversationId: payload.conversationId,
            activeConvId
          });
        }
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
        // Clean up mark read timeout
        if (markReadTimeoutRef.current) {
          clearTimeout(markReadTimeoutRef.current);
          markReadTimeoutRef.current = null;
        }
        // Clean up sound tracking refs
        sentSoundPlayedRef.current.clear();
        readSoundPlayedRef.current.clear();
        lastKnownReadStateRef.current.clear();
        typingSoundPlayedRef.current = false;
        previousTypingStateRef.current = false;
        typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        typingTimeoutsRef.current.clear();
        setTypingUsers([]);
        readMessageIdsRef.current.clear(); // Clear read tracking on unmount
        lastReadEmitRef.current.clear(); // Clear last emit times on unmount
        const activeId = selectedConversation?._id || conversationId;
        if (activeId) {
          sendTyping(activeId, false, user?.name);
        }
      };
    }
  }, [selectedConversation, conversationId, roomId, onMessageNew, onMessageSent, onMessageDelivered, onMessageSeen, onTyping, ackMessageReceived, joinConversation, user?._id, shouldMarkReadForFullView, markAsReadIfScrolledToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-mark as read when messages change and user is viewing (scrolled to bottom)
  useEffect(() => {
    const activeConvId = selectedConversation?._id || conversationId;
    if (!activeConvId || messages.length === 0) return;

    // Check if should mark as read after messages update
    // This handles cases where messages are already loaded and user is viewing
    const checkAndMarkAsRead = () => {
      if (shouldMarkReadForFullView(activeConvId)) {
        console.log('[CollabRoom] 📖 Messages changed - checking read status:', {
          conversationId: activeConvId,
          messageCount: messages.length
        });
        markAsReadIfScrolledToBottom(activeConvId);
      }
    };

    // Check after a short delay to ensure scroll completes
    const timeoutId = setTimeout(checkAndMarkAsRead, 250);
    return () => clearTimeout(timeoutId);
  }, [messages.length, selectedConversation, conversationId, shouldMarkReadForFullView, markAsReadIfScrolledToBottom]);

  const fetchRoomAndConversation = async () => {
    try {
      // Fetch room data
      const roomResponse = await axios.get(`/rooms/${roomId}`);
      console.log('[CollabRoom] Room data received:', roomResponse.data.room);
      setRoom(roomResponse.data.room);
      participantsRef.current = roomResponse.data.room.participants;
      
      // Get conversation ID for the room
      const convResponse = await axios.get(`/rooms/${roomId}/conversation`);
      if (convResponse.data.success && convResponse.data.conversationId) {
        setConversationId(convResponse.data.conversationId);
        console.log('[CollabRoom] Conversation ID:', convResponse.data.conversationId);
      } else {
        throw new Error('Failed to get conversation ID');
      }
    } catch (error: any) {
      console.error('[CollabRoom] Failed to fetch room/conversation:', error);
      if (error.response?.status === 404) {
        setErrorMessage('Room conversation not found. The room may need to be recreated.');
      } else {
        setErrorMessage(error.response?.data?.message || 'Unable to open the collaboration room. You may not have access, or the room does not exist.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!conversationId) return;
    
    try {
      const response = await axios.get(`/messages/conversations/${conversationId}/messages`);
      if (response.data.success) {
        setMessages(response.data.messages || []);
        // Mark messages as read
        try {
          await axios.post(`/messages/conversations/${conversationId}/read`);
        } catch (readError) {
          console.error('[CollabRoom] Failed to mark messages as read:', readError);
        }
      }
    } catch (error) {
      console.error('[CollabRoom] Failed to fetch messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeConvId = selectedConversation?._id || conversationId;
    if (!newMessage.trim() || !activeConvId || sending) return;
    
    const messageContent = newMessage.trim();
    setNewMessage('');
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    const tempId = `temp-${Date.now()}`;
    const activeConversationId = selectedConversation?._id || conversationId;
    const selfTimer = typingTimeoutsRef.current.get('__self__');
    if (selfTimer) {
      clearTimeout(selfTimer);
      typingTimeoutsRef.current.delete('__self__');
    }
    if (activeConversationId) {
      sendTyping(activeConversationId, false, user?.name);
    }

    // Optimistically add message with "In progress..." status
    const tempMessage = {
      _id: tempId,
      sender: {
        _id: user?._id || '',
        name: user?.name || 'You',
        profilePicture: user?.profilePicture
      },
      content: messageContent,
      createdAt: new Date().toISOString(),
      seenBy: [],
      deliveredTo: []
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setMessageStatuses(prev => ({ ...prev, [tempId]: 'In progress...' }));
      setNewMessage('');
    setSending(true);
    scrollToBottom();
    
    try {
      const response = await axios.post(`/messages/conversations/${activeConvId}/messages`, {
        content: messageContent,
        attachments: []
      });
      
      if (response.data.success) {
        // Remove temp message - real message will come via socket
        setMessages(prev => prev.filter(m => m._id !== tempId));
        // Refresh conversations to update last message
        fetchConversations();
      }
    } catch (error: any) {
      console.error('[CollabRoom] Error sending message:', error);
      // Remove temp message and restore input
      setMessages(prev => prev.filter(m => m._id !== tempId));
      setMessageStatuses(prev => {
        const updated = { ...prev };
        delete updated[tempId];
        return updated;
      });
      setNewMessage(messageContent); // Restore message on error
      alert(error.response?.data?.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };
  
  const getMessageStatus = (message: any): string => {
    if (message.sender._id !== user?._id) return '';
    
    // Check if message is read (seenBy contains other participants)
    const otherParticipants = room?.participants
      .filter(p => (p.user?._id || p.user || p).toString() !== user?._id)
      .map(p => (p.user?._id || p.user || p).toString()) || [];
    
    const isRead = message.seenBy?.some((id: any) => {
      const idStr = typeof id === 'string' ? id : (id?.toString?.() || String(id));
      return otherParticipants.includes(idStr);
    });
    
    if (isRead) return 'Read';
    
    // Check if delivered
    if (message.deliveredTo && message.deliveredTo.length > 0) {
      return 'Delivered';
    }
    
    // Check status from state
    if (messageStatuses[message._id]) {
      return messageStatuses[message._id];
    }
    
    return 'Sent';
  };

  // Find the most recently read message (the last message in chronological order that is read)
  const mostRecentlyReadMessageId = useMemo(() => {
    const currentUserId = user?._id ? user._id.toString() : '';
    if (!currentUserId || !room?.participants) return null;
    
    // Find the last message in the array that is read (most recent chronologically)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const senderId = msg?.sender?._id?.toString();
      if (senderId !== currentUserId) continue;
      
      // Check if message is read (inline logic to avoid dependency on getMessageStatus)
      const otherParticipants = room.participants
        .filter(p => (p.user?._id || p.user || p).toString() !== currentUserId)
        .map(p => (p.user?._id || p.user || p).toString());
      
      const isRead = msg.seenBy?.some((id: any) => {
        const idStr = typeof id === 'string' ? id : (id?.toString?.() || String(id));
        return otherParticipants.includes(idStr);
      });
      
      if (isRead) {
        return typeof msg._id === 'string' ? msg._id : String(msg._id);
      }
    }
    
    return null;
  }, [messages, user?._id, room?.participants]);

  // Find the latest own message
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
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Filter conversations by search term
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

  // Get current active conversation display name
  const getActiveConversationName = () => {
    if (selectedConversation) {
      if (selectedConversation.isRoom) {
        return selectedConversation.roomName || 'Room';
      } else {
        const other = selectedConversation.otherParticipant || 
          selectedConversation.participants.find(p => p._id !== user?._id);
        return other?.name || 'Conversation';
      }
    }
    return room?.name || 'Room Chat';
  };

  // Get online participants (aggregate status) - matching RoomChatWidget
  const onlineParticipants = useMemo(() => {
    if (!room?.participants?.length) return [];
    const currentUserId = user?._id ? user._id.toString() : '';
    return room.participants
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
  }, [room?.participants, user?._id, getUserStatus]);

  const onlineCount = useMemo(() => {
    if (!room?.participants?.length) return 0;
    const currentUserId = user?._id ? user._id.toString() : '';
    return room.participants.filter((p: any) => {
      const participantId = p?.user?._id ? p.user._id.toString() : null;
      if (!participantId || participantId === currentUserId) return false;
      const status = getUserStatus(participantId);
      return status.status === 'online';
    }).length;
  }, [room?.participants, user?._id, getUserStatus]);

  const extraOnlineCount = Math.max(0, onlineCount - 3);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId || sending) return;
    
    // TODO: Upload file to Cloudinary and get URL
    // For now, send a message about the file
    setSending(true);
    try {
      const response = await axios.post(`/messages/conversations/${conversationId}/messages`, {
        content: `Shared file: ${file.name}`,
        attachments: [{
          name: file.name,
          type: file.type,
          size: file.size
        }]
      });
      
      if (response.data.success) {
        console.log('[CollabRoom] File message sent successfully');
      }
    } catch (error: any) {
      console.error('[CollabRoom] Error sending file message:', error);
      alert(error.response?.data?.message || 'Failed to share file. Please try again.');
    } finally {
      setSending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  const handleCompleteRoom = async () => {
    console.log('[CollabRoom] Completing room:', roomId);
    if (!roomId) {
      console.warn('[CollabRoom] Cannot complete: no roomId');
      return;
    }

    if (!window.confirm('Are you sure you want to mark this room as completed?')) {
      return;
    }

    try {
      const response = await axios.post(`/rooms/${roomId}/complete`);
      console.log('[CollabRoom] Room completed successfully:', response.data);
      navigate('/app/feed');
    } catch (error: any) {
      console.error('[CollabRoom] Failed to complete room:', error);
      alert(error.response?.data?.message || 'Failed to complete room. Please try again.');
    }
  };

  const startVideoCall = () => {
    console.log('[CollabRoom] Starting video call for room:', roomId);
    console.log('[CollabRoom] Current isVideoCallActive:', isVideoCallActive);
    setIsVideoCallActive(true);
    console.log('[CollabRoom] Set isVideoCallActive to true');
  };

  const endVideoCall = () => {
    setIsVideoCallActive(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-[var(--text-primary)] mb-4">Unable to open room</h1>
          <p className="text-secondary-600 dark:text-[var(--text-secondary)] mb-6">{errorMessage}</p>
          <button onClick={() => navigate('/app/feed')} className="btn-primary">
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-secondary-900 mb-4">Room not found</h1>
          <p className="text-secondary-600 mb-6">The collaboration room you're looking for doesn't exist.</p>
          <button onClick={() => navigate('/app/feed')} className="btn-primary">
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  const getId = (val: any) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (val._id) return typeof val._id === 'string' ? val._id : val._id.toString();
    if (val.toString) return val.toString();
    return null;
  };
  
  const isParticipant = room.participants?.some(p => {
    const userId = getId(p.user);
    const currentUserId = user?._id;
    console.log('[CollabRoom] Checking participant:', { userId, currentUserId, match: userId === currentUserId });
    return userId === currentUserId;
  }) || false;
  
  const isCreator = getId(room.creator) === user?._id;
  console.log('[CollabRoom] Access check:', { isParticipant, isCreator, userId: user?._id, creatorId: getId(room.creator) });

  if (!isParticipant) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-secondary-900 mb-4">Access Denied</h1>
          <p className="text-secondary-600 mb-6">You are not a participant in this room.</p>
          <button onClick={() => navigate('/app/feed')} className="btn-primary">
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  console.log('[CollabRoom] Render check:', { isVideoCallActive, roomId, shouldShowVideoCall: isVideoCallActive && roomId });

  return (
    <>
      {/* Video Call Modal - Render outside container for proper z-index */}
      {isVideoCallActive && roomId && (
        <VideoCall roomId={roomId} onEndCall={endVideoCall} />
      )}
      {isVideoCallActive && !roomId && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg p-6">
            <p className="text-red-600">Error: Room ID is missing</p>
            <button onClick={endVideoCall} className="btn-primary mt-4">Close</button>
          </div>
        </div>
      )}
      
      <div className="flex max-h-[700px] bg-gray-50 dark:bg-[var(--bg-page)]" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Left Panel: Conversation List (Inbox) */}
        <div className={`${inboxCollapsed ? 'w-0 hidden md:block md:w-16' : 'w-0 md:w-80'} transition-all duration-300 bg-white dark:bg-[var(--bg-card)] border-r border-gray-200 dark:border-[var(--border-color)] flex flex-col overflow-hidden`}>
          {!inboxCollapsed && (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-[var(--border-color)] flex items-center justify-between">
                <h2 className="text-xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">Messages</h2>
                <button
                  onClick={() => setInboxCollapsed(true)}
                  className="hidden md:flex p-2 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                  title="Collapse inbox"
                >
                  <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-[var(--icon-color)]" />
                </button>
                <button
                  onClick={() => setShowMobileInbox(false)}
                  className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                  title="Close inbox"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-[var(--icon-color)]" />
                </button>
              </div>
              <div className="p-4 border-b border-gray-200 dark:border-[var(--border-color)]">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-[var(--icon-color)]" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-[var(--link-color)]"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-gray-500">Loading...</div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {searchTerm ? 'No conversations found' : 'No messages yet'}
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isRoom = conv.isRoom && conv.roomId;
                    const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
                    const isSelected = selectedConversation?._id === conv._id || (isRoom && conv.roomId === roomId);
                    
                    const getRoomStatusColor = (status?: string) => {
                      switch (status) {
                        case 'Active': return 'bg-green-100 text-green-700';
                        case 'Completed': return 'bg-gray-100 text-gray-700';
                        case 'Cancelled': return 'bg-red-100 text-red-700';
                        default: return 'bg-gray-100 text-gray-700';
                      }
                    };

                    return (
                      <div
                        key={conv._id}
                        onClick={() => handleSelectConversation(conv)}
                        className={`p-4 border-b border-gray-100 dark:border-[var(--border-color)] cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)] transition-colors ${
                          isSelected ? 'bg-primary-50 dark:bg-[var(--bg-hover)] border-l-4 border-l-primary-600 dark:border-l-[var(--link-color)]' : ''
                        } ${isRoom ? 'bg-blue-50/50 dark:bg-[var(--bg-hover)]/50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {isRoom ? (
                              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-[var(--bg-panel)] flex items-center justify-center">
                                <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-[var(--link-color)]" />
                              </div>
                            ) : (
                              <>
                                <img
                                  src={getProfileImageUrl(other?.profilePicture) || '/default-avatar.png'}
                                  alt={other?.name}
                                  className="h-12 w-12 rounded-full object-cover"
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
                                <h3 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate">
                                  {isRoom ? conv.roomName || 'Room' : other?.name}
                                </h3>
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
                              <p className="text-sm text-gray-600 truncate flex-1">
                                {conv.lastMessage?.content || 'No messages yet'}
                              </p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {conv.isMuted && (
                                  <BellSlashIcon className="h-4 w-4 text-gray-400" />
                                )}
                                {conv.unreadCount > 0 && (
                                  <span className="bg-primary-600 text-white text-xs font-medium rounded-full px-2 py-0.5">
                                    {conv.unreadCount}
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
            </>
          )}
          {inboxCollapsed && (
            <div className="hidden md:flex flex-col items-center py-2">
              <button
                onClick={() => setInboxCollapsed(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Expand inbox"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>
          )}
        </div>

        {/* Center Panel: Chat Thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header - Matching RoomChatWidget layout */}
          <div className="bg-white dark:bg-[var(--bg-card)] border-b border-gray-200 dark:border-[var(--border-color)] p-3 flex items-center justify-between bg-primary-50 dark:bg-[var(--bg-hover)]">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <button
                onClick={() => {
                  setShowMobileInbox(true);
                }}
                className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-lg flex-shrink-0"
                title="Show inbox"
              >
                <Bars3Icon className="h-5 w-5 text-gray-600 dark:text-[var(--icon-color)]" />
              </button>
              {inboxCollapsed && (
                <button
                  onClick={() => setInboxCollapsed(false)}
                  className="hidden md:flex p-2 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-lg flex-shrink-0"
                  title="Show inbox"
                >
                  <Bars3Icon className="h-5 w-5 text-gray-600 dark:text-[var(--icon-color)]" />
                </button>
              )}
              <div className="relative flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-[var(--bg-panel)] flex items-center justify-center">
                  <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-[var(--link-color)]" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate leading-tight">{getActiveConversationName()}</h1>
                <div className="mt-0.5">
                  {roomId && room ? (
                    onlineCount > 0 ? (
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
                              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white"></div>
                            </div>
                          ))}
                        </div>
                        {extraOnlineCount > 0 && (
                          <span className="text-xs text-gray-500">
                            and {extraOnlineCount} more online
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">No one online</span>
                    )
                  ) : (
                    <span className="text-xs text-gray-500">Select a conversation</span>
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
            <div className="flex space-x-2 items-center">
              {roomId && (
                <>
            <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startVideoCall();
                    }}
              className="btn-secondary flex items-center"
            >
              <VideoCameraIcon className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Video Call</span>
            </button>
                  {isCreator && room?.status === 'Active' && (
              <button
                onClick={handleCompleteRoom}
                className="btn-primary flex items-center"
              >
                <CheckIcon className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Complete</span>
              </button>
            )}
                </>
              )}
            </div>
          </div>

          {/* Chat Messages - Matching RoomChatWidget padding and spacing */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 bg-white dark:bg-[var(--bg-card)] overflow-y-auto p-3 space-y-2"
            onScroll={() => {
              // Debounce scroll handler to avoid excessive calls
              const activeConvId = selectedConversation?._id || conversationId;
              if (!activeConvId || document.visibilityState !== 'visible') return;
              
              // Clear existing scroll timeout
              if (markReadTimeoutRef.current) {
                clearTimeout(markReadTimeoutRef.current);
              }
              
              // Debounce scroll events - only check after scrolling stops
              markReadTimeoutRef.current = setTimeout(() => {
                const shouldMark = shouldMarkReadForFullView(activeConvId);
                if (shouldMark) {
                  console.log('[CollabRoom] 📖 Scroll to bottom detected - marking as read');
                  markAsReadIfScrolledToBottom(activeConvId);
                }
                markReadTimeoutRef.current = null;
              }, 300); // 300ms debounce - wait for scroll to settle
            }}
          >
              {messages.map((message, index) => {
                const isOwnMessage = message.sender._id === user?._id;
                const status = getMessageStatus(message);
                const messageId = typeof message._id === 'string' ? message._id : String(message._id);
                const isActive = activeMessageId === messageId;
                const isLatest = messageId === latestOwnMessageId;
                const isMostRecentlyRead = messageId === mostRecentlyReadMessageId;
                const isRoomChat = selectedConversation?.isRoom || (roomId && !selectedConversation);
                const showSenderName = !isOwnMessage || (isRoomChat && (room?.participants.length || 0) > 2);
                
                return (
                  <div
                    key={message._id}
                    onClick={() => {
                      if (isOwnMessage) {
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
                      {showSenderName && (
                        <div className="text-xs text-gray-500 dark:text-[var(--text-muted)] mb-0.5 px-1">
                          {!isOwnMessage && message.sender.name}
                        </div>
                      )}
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
                      {/* Use shared component for consistent status rendering */}
                      {isOwnMessage && status && (
                        <MessageStatusRenderer
                          isOwnMessage={isOwnMessage}
                          status={status}
                          messageId={messageId}
                          isLatest={isLatest}
                          isMostRecentlyRead={isMostRecentlyRead}
                          isActive={isActive}
                          readIndicatorUsers={room?.participants
                            ?.filter(p => {
                              const pId = (p.user?._id || p.user || p).toString();
                              return pId !== user?._id && message.seenBy?.some((id: any) => {
                                const idStr = typeof id === 'string' ? id : (id?.toString?.() || String(id));
                                return idStr === pId;
                              });
                            })
                            .map(p => {
                              const participant = p.user || p;
                              return {
                                userId: (participant?._id || participant).toString(),
                                name: participant?.name || 'Participant',
                                profilePicture: participant?.profilePicture,
                              };
                            })}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              <TypingActivityBar users={typingUsers} />
              <div ref={messagesEndRef} />
          </div>

            {/* Message Input */}
          <div className="p-3 border-t border-gray-200 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)]">
              <form onSubmit={handleSendMessage} className="flex space-x-2 items-end">
              {roomId && conversationId && (
                <CreateMenu roomId={roomId} conversationId={conversationId} />
              )}
                <textarea
                  ref={textareaRef}
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    const activeConvId = selectedConversation?._id || conversationId;
                    if (!activeConvId) return;
                    const hasText = e.target.value.trim().length > 0;
                    const existingSelfTimer = typingTimeoutsRef.current.get('__self__');
                    if (existingSelfTimer) {
                      clearTimeout(existingSelfTimer);
                      typingTimeoutsRef.current.delete('__self__');
                    }
                    if (hasText) {
                      sendTyping(activeConvId, true, user?.name);
                      const timeoutId = setTimeout(() => {
                        sendTyping(activeConvId, false, user?.name);
                        typingTimeoutsRef.current.delete('__self__');
                      }, 1000);
                      typingTimeoutsRef.current.set('__self__', timeoutId);
                    } else {
                      sendTyping(activeConvId, false, user?.name);
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
                          const activeConvId = selectedConversation?._id || conversationId;
                          if (newMessage.trim() && !sending && activeConvId) {
                            handleSendMessage(e as any);
                          }
                        }
                      }
                    }
                  }}
                  onBlur={() => {
                    const activeConvId = selectedConversation?._id || conversationId;
                    if (!activeConvId) return;
                    const selfTimer = typingTimeoutsRef.current.get('__self__');
                    if (selfTimer) {
                      clearTimeout(selfTimer);
                      typingTimeoutsRef.current.delete('__self__');
                    }
                    sendTyping(activeConvId, false, user?.name);
                  }}
                  placeholder={isMobileDevice() ? "Type a message... (Enter for newline)" : "Type a message... (Enter to send, Shift+Enter for newline)"}
                disabled={sending || !(selectedConversation?._id || conversationId)}
                rows={1}
                className="flex-1 input-field disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto"
                style={{ minHeight: '36px', maxHeight: '160px' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                disabled={sending || !(selectedConversation?._id || conversationId)}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PaperClipIcon className="h-4 w-4" />
                </button>
              <button 
                type="submit" 
                disabled={sending || !(selectedConversation?._id || conversationId) || !newMessage.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  <PaperAirplaneIcon className="h-4 w-4" />
                </button>
              </form>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
              />
          </div>
        </div>

        {/* Right Panel: CollabTools Sidebar (only for rooms) */}
        {roomId && room && (
          <>
            {/* Desktop Sidebar */}
            <div className={`hidden md:flex ${sidebarCollapsed ? 'w-16' : 'w-80'} transition-all duration-300 h-full`}>
              <CollabSidebar
                roomId={roomId}
                participants={room.participants}
                isCollapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              />
          </div>

            {/* Mobile Sidebar Button */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="md:hidden fixed bottom-4 right-4 bg-primary-600 text-white p-3 rounded-full shadow-lg z-40"
              title="Show CollabTools"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Mobile Inbox Overlay */}
        {showMobileInbox && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex">
            <div className="w-80 bg-white dark:bg-[var(--bg-card)] h-full overflow-y-auto flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-[var(--border-color)] flex items-center justify-between flex-shrink-0">
                <h2 className="text-xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">Messages</h2>
              <button
                  onClick={() => setShowMobileInbox(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-lg"
              >
                  <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
              <div className="p-4 border-b border-gray-200 dark:border-[var(--border-color)] flex-shrink-0">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-[var(--icon-color)]" />
                <input
                  type="text"
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-[var(--link-color)] bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] placeholder-gray-400 dark:placeholder-[var(--text-muted)]"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-gray-500">Loading...</div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {searchTerm ? 'No conversations found' : 'No messages yet'}
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                  const isRoom = conv.isRoom && conv.roomId;
                  const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
                  const isSelected = selectedConversation?._id === conv._id || (isRoom && conv.roomId === roomId);
                    
                    const getRoomStatusColor = (status?: string) => {
                      switch (status) {
                        case 'Active': return 'bg-green-100 text-green-700';
                        case 'Completed': return 'bg-gray-100 text-gray-700';
                        case 'Cancelled': return 'bg-red-100 text-red-700';
                        default: return 'bg-gray-100 text-gray-700';
                      }
                    };
                  
                  return (
                    <div
                      key={conv._id}
                      onClick={() => {
                        handleSelectConversation(conv);
                        setShowMobileInbox(false);
                      }}
                        className={`p-4 border-b border-gray-100 dark:border-[var(--border-color)] cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)] transition-colors ${
                        isSelected ? 'bg-primary-50 dark:bg-[var(--bg-hover)] border-l-4 border-l-primary-600 dark:border-l-[var(--link-color)]' : ''
                        } ${isRoom ? 'bg-blue-50/50 dark:bg-[var(--bg-hover)]/50' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {isRoom ? (
                            <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-[var(--bg-panel)] flex items-center justify-center">
                              <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-[var(--link-color)]" />
                            </div>
                          ) : (
                              <>
                            <img
                              src={getProfileImageUrl(other?.profilePicture) || '/default-avatar.png'}
                              alt={other?.name}
                              className="h-12 w-12 rounded-full object-cover"
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
                          <h3 className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate">
                            {isRoom ? conv.roomName || 'Room' : other?.name}
                          </h3>
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
                              <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] truncate flex-1">
                            {conv.lastMessage?.content || 'No messages yet'}
                          </p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {conv.isMuted && (
                                  <BellSlashIcon className="h-4 w-4 text-gray-400" />
                                )}
                        {conv.unreadCount > 0 && (
                          <span className="bg-primary-600 text-white text-xs font-medium rounded-full px-2 py-0.5">
                            {conv.unreadCount}
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
            <div className="flex-1" onClick={() => setShowMobileInbox(false)} />
          </div>
        )}

        {/* Mobile Sidebar Overlay */}
        {showMobileSidebar && roomId && room && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex">
            <div className="w-80 bg-white dark:bg-[var(--bg-card)] h-full">
              <div className="p-4 border-b border-gray-200 dark:border-[var(--border-color)] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)]">CollabTools</h2>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-[var(--bg-hover)] rounded-lg"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
                  </div>
              <CollabSidebar
                roomId={roomId}
                participants={room.participants}
                isCollapsed={false}
                onToggleCollapse={() => setShowMobileSidebar(false)}
              />
            </div>
            <div className="flex-1" onClick={() => setShowMobileSidebar(false)} />
          </div>
        )}
      </div>
    </>
  );
};

export default CollabRoom;
