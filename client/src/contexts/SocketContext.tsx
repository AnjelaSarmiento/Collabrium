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
  onMessageNew: (callback: (data: { conversationId: string; message: any }) => void) => () => void;
  onMessageSent: (callback: (data: { conversationId: string; messageId: string }) => void) => () => void;
  onMessageDelivered: (callback: (data: { conversationId: string; messageId: string }) => void) => () => void;
  onMessageSeen: (callback: (data: { conversationId: string; userId: string; seq?: number; timestamp?: string; nodeId?: string }) => void) => () => void;
  onTyping: (callback: (data: { conversationId: string; userId: string; userName: string; isTyping: boolean; timestamp?: string }) => void) => () => void;
  sendTyping: (conversationId: string, isTyping: boolean, userName?: string) => void;
  onConversationUpdate: (callback: (data: { conversationId: string }) => void) => () => void;
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
  const messageNewListenersRef = useRef<Set<(data: { conversationId: string; message: any }) => void>>(new Set());
  const messageDeliveredListenersRef = useRef<Set<(data: { conversationId: string; messageId: string }) => void>>(new Set());
  const messageSentListenersRef = useRef<Set<(data: { conversationId: string; messageId: string }) => void>>(new Set());
  const messageSeenListenersRef = useRef<Set<(data: { conversationId: string; userId: string; seq?: number; timestamp?: string; nodeId?: string }) => void>>(new Set());
  const typingListenersRef = useRef<Set<(data: { conversationId: string; userId: string; userName: string; isTyping: boolean; timestamp?: string }) => void>>(new Set());
  const conversationUpdateListenersRef = useRef<Set<(data: { conversationId: string }) => void>>(new Set());
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
          messageNewListenersRef.current.forEach((callback) => {
            try {
              callback(data);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(`message:new listener error: ${String(err)}`);
              console.error('[SocketContext] message:new listener error', error);
            }
          });
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
        newSocket.off('message:sent');
        newSocket.on('message:sent', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
              throw new Error('Invalid message:sent payload');
            }
            messageSentListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`message:sent listener error: ${String(err)}`);
                console.error('[SocketContext] message:sent listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`message:sent handler error: ${String(err)}`);
            console.error('[SocketContext] message:sent handler error', error);
          }
        });

        newSocket.off('message:delivered');
        newSocket.on('message:delivered', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
              throw new Error('Invalid message:delivered payload');
            }
            messageDeliveredListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`message:delivered listener error: ${String(err)}`);
                console.error('[SocketContext] message:delivered listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`message:delivered handler error: ${String(err)}`);
            console.error('[SocketContext] message:delivered handler error', error);
          }
        });

        newSocket.off('message:seen');
        newSocket.on('message:seen', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.userId || !evt.conversationId) {
              throw new Error('Invalid message:seen payload');
            }
            messageSeenListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`message:seen listener error: ${String(err)}`);
                console.error('[SocketContext] message:seen listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`message:seen handler error: ${String(err)}`);
            console.error('[SocketContext] message:seen handler error', error);
          }
        });

        newSocket.off('typing');
        newSocket.on('typing', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.conversationId || !evt.userId || typeof evt.isTyping !== 'boolean') {
              throw new Error('Invalid typing payload');
            }
            typingListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`typing listener error: ${String(err)}`);
                console.error('[SocketContext] typing listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`typing handler error: ${String(err)}`);
            console.error('[SocketContext] typing handler error', error);
          }
        });

        newSocket.off('conversation:update');
        newSocket.on('conversation:update', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.conversationId) {
              throw new Error('Invalid conversation:update payload');
            }
            conversationUpdateListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`conversation:update listener error: ${String(err)}`);
                console.error('[SocketContext] conversation:update listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`conversation:update handler error: ${String(err)}`);
            console.error('[SocketContext] conversation:update handler error', error);
          }
        });
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
        // Re-register event handlers to dispatch to listeners
        newSocket.off('message:sent');
        newSocket.on('message:sent', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
              throw new Error('Invalid message:sent payload');
            }
            messageSentListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`message:sent listener error: ${String(err)}`);
                console.error('[SocketContext] message:sent listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`message:sent handler error: ${String(err)}`);
            console.error('[SocketContext] message:sent handler error', error);
          }
        });

        newSocket.off('message:delivered');
        newSocket.on('message:delivered', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.messageId || !evt.conversationId) {
              throw new Error('Invalid message:delivered payload');
            }
            messageDeliveredListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`message:delivered listener error: ${String(err)}`);
                console.error('[SocketContext] message:delivered listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`message:delivered handler error: ${String(err)}`);
            console.error('[SocketContext] message:delivered handler error', error);
          }
        });

        newSocket.off('message:seen');
        newSocket.on('message:seen', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.userId || !evt.conversationId) {
              throw new Error('Invalid message:seen payload');
            }
            messageSeenListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`message:seen listener error: ${String(err)}`);
                console.error('[SocketContext] message:seen listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`message:seen handler error: ${String(err)}`);
            console.error('[SocketContext] message:seen handler error', error);
          }
        });

        newSocket.off('typing');
        newSocket.on('typing', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.conversationId || !evt.userId || typeof evt.isTyping !== 'boolean') {
              throw new Error('Invalid typing payload');
            }
            typingListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`typing listener error: ${String(err)}`);
                console.error('[SocketContext] typing listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`typing handler error: ${String(err)}`);
            console.error('[SocketContext] typing handler error', error);
          }
        });

        newSocket.off('conversation:update');
        newSocket.on('conversation:update', (evt: any) => {
          try {
            if (!evt || typeof evt !== 'object' || !evt.conversationId) {
              throw new Error('Invalid conversation:update payload');
            }
            conversationUpdateListenersRef.current.forEach((callback) => {
              try {
                callback(evt);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(`conversation:update listener error: ${String(err)}`);
                console.error('[SocketContext] conversation:update listener error', error);
              }
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(`conversation:update handler error: ${String(err)}`);
            console.error('[SocketContext] conversation:update handler error', error);
          }
        });
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
    if (socket) socket.emit('join-conversation', conversationId);
  };

  const leaveConversation = (conversationId: string) => {
    if (socket) socket.emit('leave-conversation', conversationId);
  };

  const onMessageNew = useCallback((callback: (data: { conversationId: string; message: any }) => void) => {
    messageNewListenersRef.current.add(callback);
    return () => {
      messageNewListenersRef.current.delete(callback);
    };
  }, []);

  const onMessageSent = useCallback((callback: (data: { conversationId: string; messageId: string }) => void) => {
    messageSentListenersRef.current.add(callback);
    return () => {
      messageSentListenersRef.current.delete(callback);
    };
  }, []);

  const onMessageDelivered = useCallback((callback: (data: { conversationId: string; messageId: string }) => void) => {
    messageDeliveredListenersRef.current.add(callback);
    return () => {
      messageDeliveredListenersRef.current.delete(callback);
    };
  }, []);

  const onMessageSeen = useCallback((callback: (data: { conversationId: string; userId: string; seq?: number; timestamp?: string; nodeId?: string }) => void) => {
    messageSeenListenersRef.current.add(callback);
    return () => {
      messageSeenListenersRef.current.delete(callback);
    };
  }, []);

  const onTyping = useCallback((callback: (data: { conversationId: string; userId: string; userName: string; isTyping: boolean; timestamp?: string }) => void) => {
    typingListenersRef.current.add(callback);
    return () => {
      typingListenersRef.current.delete(callback);
    };
  }, []);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean, userName?: string) => {
    if (socket && isConnected) {
      try {
        socket.emit('typing', {
          conversationId,
          isTyping,
          userName: userName || user?.name || 'User'
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(`sendTyping error: ${String(err)}`);
        console.error('[SocketContext] sendTyping error', error);
      }
    }
  }, [socket, isConnected, user?.name]);

  const onConversationUpdate = useCallback((callback: (data: { conversationId: string }) => void) => {
    conversationUpdateListenersRef.current.add(callback);
    return () => {
      conversationUpdateListenersRef.current.delete(callback);
    };
  }, []);

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
