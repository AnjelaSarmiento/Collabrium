import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
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
  const { socket, joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, ackMessageReceived, onTyping, sendTyping, joinRoom, leaveRoom } = useSocket();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantsRef = useRef<Room['participants']>([] as Room['participants']);

  useEffect(() => {
    participantsRef.current = room?.participants ?? [];
  }, [room?.participants]);

  // Fetch conversations list
  const fetchConversations = async () => {
    try {
      const response = await axios.get('/conversations');
      if (response.data.success) {
        setConversations(response.data.conversations || []);
        // Auto-select room conversation if we're in a room and haven't selected one yet
        if (roomId && conversationId && !selectedConversation) {
          const roomConv = response.data.conversations.find((c: Conversation) => 
            c.isRoom && c.roomId === roomId
          );
          if (roomConv) {
            setSelectedConversation(roomConv);
          }
        }
      }
    } catch (error) {
      console.error('[CollabRoom] Failed to fetch conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
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
      fetchConversations();
    };
    
    socket.on('conversation:update', handleConversationUpdate);
    return () => {
      socket.off('conversation:update', handleConversationUpdate);
    };
  }, [socket]);

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
      
      // Listen for new messages
      const handleMessageNew = (data: { conversationId: string; message: any }) => {
        if (data.conversationId === activeConvId) {
          setMessages(prev => [...prev, data.message]);
          ackMessageReceived(activeConvId, data.message._id);
          scrollToBottom();
        }
      };
      
      // Listen for message sent status
      const handleMessageSent = (data: { conversationId: string; messageId: string }) => {
        if (data.conversationId === activeConvId) {
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
            } else {
              setTypingUsers(prev => prev.filter(u => u.userId !== incomingUserId));
              const existingTimeout = typingTimeoutsRef.current.get(incomingUserId);
              if (existingTimeout) clearTimeout(existingTimeout);
              typingTimeoutsRef.current.delete(incomingUserId);
            }
          }
        }
      };
      
      const offMessageNew = onMessageNew(handleMessageNew);
      const offMessageSent = onMessageSent(handleMessageSent);
      const offMessageDelivered = onMessageDelivered(handleMessageDelivered);
      const offTyping = onTyping(handleTyping);
      
      return () => {
        offMessageNew();
        offMessageSent();
        offMessageDelivered();
        offTyping();
        typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        typingTimeoutsRef.current.clear();
        setTypingUsers([]);
        const activeId = selectedConversation?._id || conversationId;
        if (activeId) {
          sendTyping(activeId, false, user?.name);
        }
      };
    }
  }, [selectedConversation, conversationId, roomId, onMessageNew, onMessageSent, onMessageDelivered, onTyping, ackMessageReceived, joinConversation, user?._id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
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
          <h1 className="text-2xl font-bold text-secondary-900 mb-4">Unable to open room</h1>
          <p className="text-secondary-600 mb-6">{errorMessage}</p>
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
          <div className="bg-white rounded-lg p-6">
            <p className="text-red-600">Error: Room ID is missing</p>
            <button onClick={endVideoCall} className="btn-primary mt-4">Close</button>
          </div>
        </div>
      )}
      
      <div className="flex max-h-[700px] bg-gray-50" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Left Panel: Conversation List (Inbox) */}
        <div className={`${inboxCollapsed ? 'w-0 hidden md:block md:w-16' : 'w-full md:w-80'} transition-all duration-300 bg-white border-r border-gray-200 flex flex-col overflow-hidden`}>
          {!inboxCollapsed && (
            <>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-secondary-900">Messages</h2>
                <button
                  onClick={() => setInboxCollapsed(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Collapse inbox"
                >
                  <ChevronLeftIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                        className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-primary-50 border-l-4 border-l-primary-600' : ''
                        } ${isRoom ? 'bg-blue-50/50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {isRoom ? (
                              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                                <UserGroupIcon className="h-6 w-6 text-blue-600" />
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
                                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white"
                                />
                              </>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-secondary-900 truncate">
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
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowMobileInbox(true)}
                className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
                title="Show inbox"
              >
                <Bars3Icon className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-secondary-900">{getActiveConversationName()}</h1>
                {roomId && room && (
                  <div className="flex items-center mt-1 space-x-4">
                    <div className="flex items-center text-sm text-secondary-500">
                      <UserGroupIcon className="h-4 w-4 mr-1" />
                      {room.participants.length} {room.participants.length === 1 ? 'participant' : 'participants'}
                    </div>
                    <div className="flex items-center text-sm text-secondary-500">
                      <ClockIcon className="h-4 w-4 mr-1" />
                      {room.status === 'Active' ? 'Live' : room.status}
                    </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
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

          {/* Chat Messages */}
          <div className="flex-1 bg-white overflow-y-auto p-3 space-y-1.5">
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
                    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[280px] lg:max-w-[350px]`}>
                      {showSenderName && (
                        <div className={`text-xs font-medium mb-1 px-2 ${isOwnMessage ? 'text-secondary-600' : 'text-secondary-700'}`}>
                        {message.sender.name}
                        </div>
                      )}
                      <div
                        className={`px-3 py-2 rounded-lg ${
                          isOwnMessage
                            ? 'bg-[#3D61D4] text-white rounded-br-sm'
                            : 'bg-secondary-100 text-secondary-900 rounded-bl-sm'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
                        <div className={`flex items-center justify-end gap-2 mt-1 ${isOwnMessage ? 'text-primary-100' : 'text-secondary-500'}`}>
                          <span className="text-xs">
                            {formatTime(message.createdAt)}
                          </span>
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
                    {isOwnMessage && (
                      <img
                        src={getProfileImageUrl(user?.profilePicture) || '/default-avatar.png'}
                        alt={user?.name}
                        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    </div>
                );
              })}
              <TypingActivityBar users={typingUsers} />
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
          <div className="p-3 border-t border-gray-200 bg-white">
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
            <div className="w-80 bg-white h-full overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-secondary-900">Messages</h2>
              <button
                  onClick={() => setShowMobileInbox(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
              >
                  <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredConversations.map((conv) => {
                  const isRoom = conv.isRoom && conv.roomId;
                  const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
                  const isSelected = selectedConversation?._id === conv._id || (isRoom && conv.roomId === roomId);
                  
                  return (
                    <div
                      key={conv._id}
                      onClick={() => {
                        handleSelectConversation(conv);
                        setShowMobileInbox(false);
                      }}
                      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-primary-50 border-l-4 border-l-primary-600' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {isRoom ? (
                            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                              <UserGroupIcon className="h-6 w-6 text-blue-600" />
                            </div>
                          ) : (
                            <img
                              src={getProfileImageUrl(other?.profilePicture) || '/default-avatar.png'}
                              alt={other?.name}
                              className="h-12 w-12 rounded-full object-cover"
                            />
                      )}
                    </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-secondary-900 truncate">
                            {isRoom ? conv.roomName || 'Room' : other?.name}
                          </h3>
                          <p className="text-sm text-gray-600 truncate">
                            {conv.lastMessage?.content || 'No messages yet'}
                          </p>
                  </div>
                        {conv.unreadCount > 0 && (
                          <span className="bg-primary-600 text-white text-xs font-medium rounded-full px-2 py-0.5">
                            {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                  );
                })}
              </div>
            </div>
            <div className="flex-1" onClick={() => setShowMobileInbox(false)} />
          </div>
        )}

        {/* Mobile Sidebar Overlay */}
        {showMobileSidebar && roomId && room && (
          <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex">
            <div className="w-80 bg-white h-full">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-secondary-900">CollabTools</h2>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
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
