import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getProfileImageUrl } from '../utils/image';
import axios from 'axios';
import VideoCall from '../components/VideoCall';
import {
  PaperAirplaneIcon,
  PaperClipIcon,
  VideoCameraIcon,
  PhoneIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  UserGroupIcon,
  ClockIcon,
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

const CollabRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, ackMessageReceived, onTyping, sendTyping } = useSocket();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'Medium' });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (roomId) {
      fetchRoomAndConversation();
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
    };
  }, [roomId, conversationId]);

  useEffect(() => {
    if (conversationId) {
      // Set active conversation ID so notification system knows user is viewing this conversation
      window.__activeConversationId = conversationId;
      
      fetchMessages();
      joinConversation(conversationId);
      
      // Listen for new messages
      onMessageNew((data: { conversationId: string; message: any }) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => [...prev, data.message]);
          // Auto-ACK message receipt
          ackMessageReceived(conversationId, data.message._id);
          scrollToBottom();
        }
      });
      
      // Listen for message sent status
      onMessageSent((data: { conversationId: string; messageId: string }) => {
        if (data.conversationId === conversationId) {
          setMessageStatuses(prev => ({
            ...prev,
            [data.messageId]: 'Sent'
          }));
        }
      });
      
      // Listen for message delivered status
      onMessageDelivered((data: { conversationId: string; messageId: string }) => {
        if (data.conversationId === conversationId) {
          setMessageStatuses(prev => ({
            ...prev,
            [data.messageId]: 'Delivered'
          }));
        }
      });
      
      // Listen for typing indicators
      onTyping((data: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => {
        if (data.conversationId === conversationId && data.userId !== user?._id) {
          setTypingUsers(prev => {
            const updated = new Set(prev);
            if (data.isTyping) {
              updated.add(data.userName);
              // Auto-remove after 3 seconds if no update
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
              }
              typingTimeoutRef.current = setTimeout(() => {
                setTypingUsers(current => {
                  const next = new Set(current);
                  next.delete(data.userName);
                  return next;
                });
              }, 3000);
            } else {
              updated.delete(data.userName);
            }
            return updated;
          });
        }
      });
    }
  }, [conversationId, onMessageNew, onMessageSent, onMessageDelivered, onTyping, ackMessageReceived, joinConversation, user?._id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchRoomAndConversation = async () => {
    try {
      // Fetch room data
      const roomResponse = await axios.get(`/rooms/${roomId}`);
      console.log('[CollabRoom] Room data received:', roomResponse.data.room);
      setRoom(roomResponse.data.room);
      
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
      const response = await axios.get(`/conversations/${conversationId}/messages`);
      if (response.data.success) {
        setMessages(response.data.messages || []);
        // Mark messages as read
        try {
          await axios.post(`/conversations/${conversationId}/read`);
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
    if (!newMessage.trim() || !conversationId || sending) return;
    
    const messageContent = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    
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
      const response = await axios.post(`/conversations/${conversationId}/messages`, {
        content: messageContent,
        attachments: []
      });
      
      if (response.data.success) {
        // Remove temp message - real message will come via socket
        setMessages(prev => prev.filter(m => m._id !== tempId));
        // Status will be updated via socket events
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId || sending) return;
    
    // TODO: Upload file to Cloudinary and get URL
    // For now, send a message about the file
    setSending(true);
    try {
      const response = await axios.post(`/conversations/${conversationId}/messages`, {
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

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[CollabRoom] Adding task:', { newTask, roomId });
    if (!newTask.title.trim() || !roomId) {
      console.warn('[CollabRoom] Cannot add task: missing title or roomId');
      return;
    }

    try {
      const response = await axios.post(`/rooms/${roomId}/task`, newTask);
      console.log('[CollabRoom] Task added successfully:', response.data);
      setNewTask({ title: '', description: '', priority: 'Medium' });
      setShowTaskForm(false);
      fetchRoomAndConversation(); // Refresh room data
    } catch (error: any) {
      console.error('[CollabRoom] Failed to add task:', error);
      alert(error.response?.data?.message || 'Failed to add task. Please try again.');
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
      
      <div className="max-w-7xl mx-auto">
        {/* Room Header */}
      <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900">{room.name}</h1>
            <p className="text-secondary-600 mt-1">{room.description}</p>
            <div className="flex items-center mt-2 space-x-4">
              <div className="flex items-center text-sm text-secondary-500">
                <ClockIcon className="h-4 w-4 mr-1" />
                Started {new Date(room.sessionStart).toLocaleDateString()}
              </div>
              <div className="flex items-center text-sm text-secondary-500">
                <UserGroupIcon className="h-4 w-4 mr-1" />
                {room.participants.length} participants
              </div>
              {room.postId.reward && (
                <div className="flex items-center text-sm text-green-600 font-medium">
                  <span className="bg-green-100 px-2 py-1 rounded-full">
                    {room.postId.reward} CollabPoints
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
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
              Video Call
            </button>
            {isCreator && room.status === 'Active' && (
              <button
                onClick={handleCompleteRoom}
                className="btn-primary flex items-center"
              >
                <CheckIcon className="h-4 w-4 mr-2" />
                Complete Room
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Section */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 h-[600px] flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-secondary-200">
              <h3 className="text-lg font-medium text-secondary-900">Chat</h3>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((message, index) => {
                const isOwnMessage = message.sender._id === user?._id;
                const status = getMessageStatus(message);
                const showSenderName = !isOwnMessage || (room?.participants.length || 0) > 2;
                
                return (
                  <div
                    key={message._id}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} items-end gap-2`}
                  >
                    {!isOwnMessage && (
                      <img
                        src={getProfileImageUrl(message.sender.profilePicture) || '/default-avatar.png'}
                        alt={message.sender.name}
                        className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-xs lg:max-w-md`}>
                      {showSenderName && (
                        <div className={`text-xs font-medium mb-1 px-2 ${isOwnMessage ? 'text-secondary-600' : 'text-secondary-700'}`}>
                          {message.sender.name}
                        </div>
                      )}
                      <div
                        className={`px-4 py-2 rounded-lg ${
                          isOwnMessage
                            ? 'bg-primary-600 text-white rounded-br-sm'
                            : 'bg-secondary-100 text-secondary-900 rounded-bl-sm'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
                        <div className={`flex items-center justify-end gap-2 mt-1 ${isOwnMessage ? 'text-primary-100' : 'text-secondary-500'}`}>
                          <span className="text-xs">
                            {formatTime(message.createdAt)}
                          </span>
                          {isOwnMessage && status && (
                            <span className="text-xs font-medium">
                              {status === 'In progress...' && '⏳'}
                              {status === 'Sent' && '✓'}
                              {status === 'Delivered' && '✓✓'}
                              {status === 'Read' && '✓✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwnMessage && (
                      <img
                        src={getProfileImageUrl(user?.profilePicture) || '/default-avatar.png'}
                        alt={user?.name}
                        className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                  </div>
                );
              })}
              {typingUsers.size > 0 && (
                <div className="flex items-center gap-2 px-2 py-1">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-secondary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-secondary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-secondary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-secondary-600">
                    {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-secondary-200">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    // Send typing indicator
                    if (conversationId && e.target.value.trim()) {
                      sendTyping(conversationId, true);
                    } else if (conversationId) {
                      sendTyping(conversationId, false);
                    }
                  }}
                  onBlur={() => {
                    // Stop typing indicator when input loses focus
                    if (conversationId) {
                      sendTyping(conversationId, false);
                    }
                  }}
                  placeholder="Type a message..."
                  disabled={sending || !conversationId}
                  className="flex-1 input-field disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || !conversationId}
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PaperClipIcon className="h-4 w-4" />
                </button>
                <button 
                  type="submit" 
                  disabled={sending || !conversationId || !newMessage.trim()}
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Participants */}
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-4">
            <h3 className="text-lg font-medium text-secondary-900 mb-4">Participants</h3>
            <div className="space-y-3">
              {room.participants.map((participant) => (
                <div key={participant.user._id} className="flex items-center">
                  <img
                    src={participant.user.profilePicture || '/default-avatar.png'}
                    alt={participant.user.name}
                    className="h-8 w-8 rounded-full"
                  />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-secondary-900">
                      {participant.user.name}
                    </p>
                    <p className="text-xs text-secondary-500">{participant.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-secondary-900">Tasks</h3>
              <button
                onClick={() => setShowTaskForm(!showTaskForm)}
                className="btn-secondary"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>

            {showTaskForm && (
              <form onSubmit={handleAddTask} className="mb-4 p-3 bg-secondary-50 rounded-lg">
                <input
                  type="text"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full mb-2 input-field"
                  required
                />
                <textarea
                  placeholder="Task description"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full mb-2 input-field"
                  rows={2}
                />
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="w-full mb-2 input-field"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                </select>
                <div className="flex space-x-2">
                  <button type="submit" className="btn-primary flex-1">
                    Add Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTaskForm(false)}
                    className="btn-secondary"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {room.tasks.map((task) => (
                <div key={task._id} className="p-3 bg-secondary-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-medium text-secondary-900">{task.title}</h4>
                      {task.description && (
                        <p className="text-xs text-secondary-600 mt-1">{task.description}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      task.priority === 'High' ? 'bg-red-100 text-red-800' :
                      task.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                      task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {task.status}
                    </span>
                    {task.assignedTo && (
                      <span className="text-xs text-secondary-500">
                        {task.assignedTo.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shared Files */}
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-4">
            <h3 className="text-lg font-medium text-secondary-900 mb-4">Shared Files</h3>
            <div className="space-y-2">
              {room.sharedFiles.map((file) => (
                <div key={file._id} className="flex items-center p-2 bg-secondary-50 rounded-lg">
                  <PaperClipIcon className="h-4 w-4 text-secondary-500 mr-2" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-secondary-900">{file.filename}</p>
                    <p className="text-xs text-secondary-500">{file.uploadedBy.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

export default CollabRoom;
