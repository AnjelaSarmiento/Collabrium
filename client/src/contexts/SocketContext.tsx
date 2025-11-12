import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string, messageType?: string, attachments?: any[]) => void;
  ackMessageReceived: (roomId: string, messageId: string, conversationId?: string, senderId?: string) => void;
  onMessage: (callback: (data: any) => void) => void;
  onVideoOffer: (callback: (data: any) => void) => void;
  onVideoAnswer: (callback: (data: any) => void) => void;
  onIceCandidate: (callback: (data: any) => void) => void;
  sendVideoOffer: (roomId: string, offer: any) => void;
  sendVideoAnswer: (roomId: string, answer: any) => void;
  sendIceCandidate: (roomId: string, candidate: any) => void;
  onUserStatusUpdate: (callback: (data: { userId: string; status: string }) => void) => void;
  onSocialUpdate: (callback: (payload: { userIds: string[]; action: string }) => void) => void;
  // Chat handlers
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  onMessageNew: (callback: (data: { conversationId: string; message: any }) => void) => void;
  onMessageSent: (callback: (data: { conversationId: string; messageId: string }) => void) => void;
  onMessageDelivered: (callback: (data: { conversationId: string; messageId: string }) => void) => void;
  onMessageSeen: (callback: (data: { conversationId: string; userId: string }) => void) => void;
  onTyping: (callback: (data: { conversationId: string; userId: string; userName: string; isTyping: boolean; timestamp?: string }) => void) => void;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
  onConversationUpdate: (callback: (data: { conversationId: string }) => void) => void;
  // Notification registration for global toast notifications
  registerNotificationCallback: (callback: (data: {
    conversationId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    message: string;
    isMuted?: boolean;
    metadata?: {
      isMuted?: boolean;
      [key: string]: any;
    };
  }) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();
  
  // Store notification callback in ref so it can be set by NotificationProvider
  // This allows SocketProvider to trigger notifications even if NotificationProvider is not yet mounted
  const notificationCallbackRef = useRef<((data: {
    conversationId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    message: string;
    isMuted?: boolean;
    metadata?: {
      isMuted?: boolean;
      [key: string]: any;
    };
  }) => void) | null>(null);
  
  // Expose method to register notification callback
  // This will be called by NotificationProvider
  const registerNotificationCallback = useCallback((callback: (data: {
    conversationId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    message: string;
    isMuted?: boolean;
    metadata?: {
      isMuted?: boolean;
      [key: string]: any;
    };
  }) => void) => {
    notificationCallbackRef.current = callback;
  }, []);
  
  // Store callbacks in refs so they persist across socket reconnections
  const messageNewCallbackRef = useRef<((data: { conversationId: string; message: any }) => void) | null>(null);
  const messageDeliveredCallbackRef = useRef<((data: { conversationId: string; messageId: string }) => void) | null>(null);
  const messageSentCallbackRef = useRef<((data: { conversationId: string; messageId: string }) => void) | null>(null);
  const messageSeenCallbackRef = useRef<((data: { conversationId: string; userId: string }) => void) | null>(null);
  const typingCallbackRef = useRef<((data: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => void) | null>(null);
  const conversationUpdateCallbackRef = useRef<((data: { conversationId: string }) => void) | null>(null);
  const userStatusUpdateCallbackRef = useRef<((data: { userId: string; status: string }) => void) | null>(null);

  useEffect(() => {
    if (user) {
      const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
        auth: {
          token: localStorage.getItem('token'),
          userId: user._id,
        },
        // Enable automatic reconnection with exponential backoff
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
        transports: ['websocket', 'polling'], // Fallback to polling if websocket fails
      });

      let heartbeatInterval: NodeJS.Timeout | null = null;

      // Global message:new listener that automatically ACKs messages from other users
      // This persists across all route changes and page navigations
      const globalMessageNewHandler = (data: any) => {
        try {
          // Validate payload
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid message:new payload: payload is not an object');
          }
          if (!data.conversationId || typeof data.conversationId !== 'string') {
            throw new Error('Invalid message:new payload: missing or invalid conversationId');
          }
          if (!data.message || typeof data.message !== 'object') {
            throw new Error('Invalid message:new payload: missing or invalid message');
          }
          
          // Only ACK messages that were NOT sent by the current user
          if (user && data.message && data.message.sender && data.message.sender._id !== user._id) {
            const payload: any = {
              roomId: `conversation:${data.conversationId}`,
              messageId: data.message._id,
              conversationId: data.conversationId,
              senderId: data.message.sender._id,
            };
            console.log('[socket] Global ACK: emit message:received', payload);
            newSocket.emit('message:received', payload);
            
            // Trigger global notification toast for new messages
            if (notificationCallbackRef.current) {
              notificationCallbackRef.current({
                conversationId: data.conversationId,
                messageId: data.message._id,
                senderId: data.message.sender._id || '',
                senderName: data.message.sender.name || 'Unknown',
                senderAvatar: data.message.sender.profilePicture,
                message: data.message.content || '',
                isMuted: data.isMuted || false, // Include mute status from backend
              });
            }
          }
          
          // Also call the registered callback if one exists (for Messages.tsx and other components)
          if (messageNewCallbackRef.current) {
            messageNewCallbackRef.current(data);
          }
        } catch (err) {
          // Only throw Error instances
          const error = err instanceof Error ? err : new Error(`message:new handler error: ${String(err)}`);
          console.error('[SocketContext] message:new handler error', error);
          // Don't re-throw - log and continue
        }
      };

      newSocket.on('connect', () => {
        console.log('Connected to server');
        setIsConnected(true);

        // Send heartbeat every 30 seconds to keep user active
        heartbeatInterval = setInterval(() => {
          if (newSocket.connected) {
            newSocket.emit('heartbeat');
          }
        }, 30000);

        // Set up global message:new listener that persists across route changes
        // This automatically ACKs messages and calls any registered callbacks
        newSocket.off('message:new');
        newSocket.on('message:new', globalMessageNewHandler);
        // Note: Individual handlers (message:sent, message:delivered, etc.) are now wrapped
        // in validation and error handling in their respective on* functions above
        // But we still need to register them here for the initial connection
        if (messageSentCallbackRef.current) {
          newSocket.off('message:sent');
          // Wrap callback in error handler for initial connection
          newSocket.on('message:sent', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
                throw new Error('Invalid message:sent payload');
              }
              messageSentCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:sent handler error: ${String(err)}`);
              console.error('[SocketContext] message:sent handler error', error);
            }
          });
        }
        if (messageDeliveredCallbackRef.current) {
          newSocket.off('message:delivered');
          newSocket.on('message:delivered', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
                throw new Error('Invalid message:delivered payload');
              }
              messageDeliveredCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:delivered handler error: ${String(err)}`);
              console.error('[SocketContext] message:delivered handler error', error);
            }
          });
        }
        if (messageSeenCallbackRef.current) {
          newSocket.off('message:seen');
          newSocket.on('message:seen', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.userId || !evt.conversationId) {
                throw new Error('Invalid message:seen payload');
              }
              messageSeenCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:seen handler error: ${String(err)}`);
              console.error('[SocketContext] message:seen handler error', error);
            }
          });
        }
        if (typingCallbackRef.current) {
          newSocket.off('typing');
          newSocket.on('typing', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.conversationId || !evt.userId || typeof evt.isTyping !== 'boolean') {
                throw new Error('Invalid typing payload');
              }
              typingCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`typing handler error: ${String(err)}`);
              console.error('[SocketContext] typing handler error', error);
            }
          });
        }
        if (conversationUpdateCallbackRef.current) {
          newSocket.off('conversation:update');
          newSocket.on('conversation:update', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.conversationId) {
                throw new Error('Invalid conversation:update payload');
              }
              conversationUpdateCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`conversation:update handler error: ${String(err)}`);
              console.error('[SocketContext] conversation:update handler error', error);
            }
          });
        }
        if (userStatusUpdateCallbackRef.current) {
          newSocket.off('user-status-update');
          newSocket.on('user-status-update', userStatusUpdateCallbackRef.current);
        }
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected to server after ${attemptNumber} attempts`);
        setIsConnected(true);
        // Server will handle online status on reconnection
        // Reattach global message:new listener
        newSocket.off('message:new');
        newSocket.on('message:new', globalMessageNewHandler);
        // Re-register handlers with error handling (same as connect handler above)
        if (messageSentCallbackRef.current) {
          newSocket.off('message:sent');
          newSocket.on('message:sent', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
                throw new Error('Invalid message:sent payload');
              }
              messageSentCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:sent handler error: ${String(err)}`);
              console.error('[SocketContext] message:sent handler error', error);
            }
          });
        }
        if (messageDeliveredCallbackRef.current) {
          newSocket.off('message:delivered');
          newSocket.on('message:delivered', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
                throw new Error('Invalid message:delivered payload');
              }
              messageDeliveredCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:delivered handler error: ${String(err)}`);
              console.error('[SocketContext] message:delivered handler error', error);
            }
          });
        }
        if (messageSeenCallbackRef.current) {
          newSocket.off('message:seen');
          newSocket.on('message:seen', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.userId || !evt.conversationId) {
                throw new Error('Invalid message:seen payload');
              }
              messageSeenCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:seen handler error: ${String(err)}`);
              console.error('[SocketContext] message:seen handler error', error);
            }
          });
        }
        if (typingCallbackRef.current) {
          newSocket.off('typing');
          newSocket.on('typing', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.conversationId || !evt.userId || typeof evt.isTyping !== 'boolean') {
                throw new Error('Invalid typing payload');
              }
              typingCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`typing handler error: ${String(err)}`);
              console.error('[SocketContext] typing handler error', error);
            }
          });
        }
        if (conversationUpdateCallbackRef.current) {
          newSocket.off('conversation:update');
          newSocket.on('conversation:update', (evt: any) => {
            try {
              if (!evt || typeof evt !== 'object' || !evt.conversationId) {
                throw new Error('Invalid conversation:update payload');
              }
              conversationUpdateCallbackRef.current!(evt);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`conversation:update handler error: ${String(err)}`);
              console.error('[SocketContext] conversation:update handler error', error);
            }
          });
        }
        if (userStatusUpdateCallbackRef.current) {
          newSocket.off('user-status-update');
          newSocket.on('user-status-update', userStatusUpdateCallbackRef.current);
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        setIsConnected(false);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setIsConnected(false);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      });

      setSocket(newSocket);

      return () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        newSocket.close();
      };
    }
  }, [user]);

  const joinRoom = (roomId: string) => {
    if (socket) socket.emit('join-room', roomId);
  };

  const leaveRoom = (roomId: string) => {
    if (socket) socket.emit('leave-room', roomId);
  };

  const sendMessage = (roomId: string, content: string, messageType = 'text', attachments: any[] = []) => {
    if (socket) {
      socket.emit('send-message', { roomId, content, messageType, attachments });
    }
  };

  const ackMessageReceived = (roomId: string, messageId: string, conversationId?: string, senderId?: string) => {
    if (socket) {
      const payload: any = { roomId, messageId };
      if (conversationId) payload.conversationId = conversationId;
      if (senderId) payload.senderId = senderId;
      console.log('[socket] emit message:received', payload);
      socket.emit('message:received', payload);
    }
  };

  const onMessage = (callback: (data: any) => void) => {
    if (socket) {
      socket.off('receive-message');
      socket.on('receive-message', callback);
    }
  };

  const onVideoOffer = (callback: (data: any) => void) => {
    if (socket) {
      socket.off('offer');
      socket.on('offer', callback);
    }
  };

  const onVideoAnswer = (callback: (data: any) => void) => {
    if (socket) {
      socket.off('answer');
      socket.on('answer', callback);
    }
  };

  const onIceCandidate = (callback: (data: any) => void) => {
    if (socket) {
      socket.off('ice-candidate');
      socket.on('ice-candidate', callback);
    }
  };

  const sendVideoOffer = (roomId: string, offer: any) => {
    if (socket) socket.emit('offer', { roomId, offer });
  };

  const sendVideoAnswer = (roomId: string, answer: any) => {
    if (socket) socket.emit('answer', { roomId, answer });
  };

  const sendIceCandidate = (roomId: string, candidate: any) => {
    if (socket) socket.emit('ice-candidate', { roomId, candidate });
  };

  // Listen for user status updates
  const onUserStatusUpdate = (callback: (data: { userId: string; status: string }) => void) => {
    userStatusUpdateCallbackRef.current = callback;
    if (socket) {
      socket.off('user-status-update');
      socket.on('user-status-update', callback);
    }
  };

  // Social updates (connections/requests)
  const onSocialUpdate = (callback: (payload: { userIds: string[]; action: string }) => void) => {
    if (socket) {
      socket.off('social:update');
      socket.on('social:update', callback);
    }
  };

  // Chat handlers
  const joinConversation = (conversationId: string) => {
    if (socket) socket.emit('join-room', `conversation:${conversationId}`);
  };

  const leaveConversation = (conversationId: string) => {
    if (socket) socket.emit('leave-room', `conversation:${conversationId}`);
  };

  const onMessageNew = (callback: (data: { conversationId: string; message: any }) => void) => {
    // Store callback so global handler can invoke it
    messageNewCallbackRef.current = callback;
    // Note: The global message:new handler in SocketContext will call this callback
    // We don't replace the global listener here - it persists across route changes
    // The global handler calls both the ACK and the registered callback
  };

  const onMessageSent = (callback: (data: { conversationId: string; messageId: string }) => void) => {
    messageSentCallbackRef.current = callback;
    if (socket) {
      socket.off('message:sent');
      socket.on('message:sent', (evt: any) => {
        try {
          // Validate payload
          if (!evt || typeof evt !== 'object') {
            throw new Error('Invalid message:sent payload: payload is not an object');
          }
          if (!evt.messageId || typeof evt.messageId !== 'string') {
            throw new Error('Invalid message:sent payload: missing or invalid messageId');
          }
          if (!evt.conversationId || typeof evt.conversationId !== 'string') {
            throw new Error('Invalid message:sent payload: missing or invalid conversationId');
          }
          callback(evt);
        } catch (err) {
          // Only throw Error instances
          const error = err instanceof Error ? err : new Error(`message:sent handler error: ${String(err)}`);
          console.error('[SocketContext] message:sent handler error', error);
          // Don't re-throw - log and continue
        }
      });
    }
  };

  const onMessageDelivered = (callback: (data: { conversationId: string; messageId: string }) => void) => {
    messageDeliveredCallbackRef.current = callback;
    if (socket) {
      socket.off('message:delivered');
      socket.on('message:delivered', (evt: any) => {
        try {
          // Validate payload
          if (!evt || typeof evt !== 'object') {
            throw new Error('Invalid message:delivered payload: payload is not an object');
          }
          if (!evt.messageId || typeof evt.messageId !== 'string') {
            throw new Error('Invalid message:delivered payload: missing or invalid messageId');
          }
          if (!evt.conversationId || typeof evt.conversationId !== 'string') {
            throw new Error('Invalid message:delivered payload: missing or invalid conversationId');
          }
          callback(evt);
        } catch (err) {
          // Only throw Error instances
          const error = err instanceof Error ? err : new Error(`message:delivered handler error: ${String(err)}`);
          console.error('[SocketContext] message:delivered handler error', error);
          // Don't re-throw - log and continue
        }
      });
    }
  };

  const onMessageSeen = (callback: (data: { conversationId: string; userId: string }) => void) => {
    messageSeenCallbackRef.current = callback;
    if (socket) {
      socket.off('message:seen');
      socket.on('message:seen', (evt: any) => {
        try {
          // Validate payload
          if (!evt || typeof evt !== 'object') {
            throw new Error('Invalid message:seen payload: payload is not an object');
          }
          if (!evt.userId || typeof evt.userId !== 'string') {
            throw new Error('Invalid message:seen payload: missing or invalid userId');
          }
          if (!evt.conversationId || typeof evt.conversationId !== 'string') {
            throw new Error('Invalid message:seen payload: missing or invalid conversationId');
          }
          callback(evt);
        } catch (err) {
          // Only throw Error instances
          const error = err instanceof Error ? err : new Error(`message:seen handler error: ${String(err)}`);
          console.error('[SocketContext] message:seen handler error', error);
          // Don't re-throw - log and continue
        }
      });
    }
  };

  const onTyping = (callback: (data: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => void) => {
    typingCallbackRef.current = callback;
    if (socket) {
      socket.off('typing');
      socket.on('typing', (evt: any) => {
        try {
          // Validate payload
          if (!evt || typeof evt !== 'object') {
            throw new Error('Invalid typing payload: payload is not an object');
          }
          if (!evt.conversationId || typeof evt.conversationId !== 'string') {
            throw new Error('Invalid typing payload: missing or invalid conversationId');
          }
          if (!evt.userId || typeof evt.userId !== 'string') {
            throw new Error('Invalid typing payload: missing or invalid userId');
          }
          if (typeof evt.isTyping !== 'boolean') {
            throw new Error('Invalid typing payload: missing or invalid isTyping');
          }
          callback(evt);
        } catch (err) {
          // Only throw Error instances
          const error = err instanceof Error ? err : new Error(`typing handler error: ${String(err)}`);
          console.error('[SocketContext] typing handler error', error);
          // Don't re-throw - log and continue
        }
      });
    }
  };

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    if (socket && isConnected) {
      try {
        socket.emit('typing', {
          conversationId,
          isTyping
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(`sendTyping error: ${String(err)}`);
        console.error('[SocketContext] sendTyping error', error);
      }
    }
  }, [socket, isConnected]);

  const onConversationUpdate = (callback: (data: { conversationId: string }) => void) => {
    conversationUpdateCallbackRef.current = callback;
    if (socket) {
      socket.off('conversation:update');
      socket.on('conversation:update', (evt: any) => {
        try {
          // Validate payload
          if (!evt || typeof evt !== 'object') {
            throw new Error('Invalid conversation:update payload: payload is not an object');
          }
          if (!evt.conversationId || typeof evt.conversationId !== 'string') {
            throw new Error('Invalid conversation:update payload: missing or invalid conversationId');
          }
          callback(evt);
        } catch (err) {
          // Only throw Error instances
          const error = err instanceof Error ? err : new Error(`conversation:update handler error: ${String(err)}`);
          console.error('[SocketContext] conversation:update handler error', error);
          // Don't re-throw - log and continue
        }
      });
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    joinRoom,
    leaveRoom,
    sendMessage,
    ackMessageReceived,
    onMessage,
    onVideoOffer,
    onVideoAnswer,
    onIceCandidate,
    sendVideoOffer,
    sendVideoAnswer,
    sendIceCandidate,
    onUserStatusUpdate,
    onSocialUpdate,
    joinConversation,
    leaveConversation,
    onMessageNew,
    onMessageSent,
    onMessageDelivered,
    onMessageSeen,
    onTyping,
    sendTyping,
    onConversationUpdate,
    registerNotificationCallback,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
