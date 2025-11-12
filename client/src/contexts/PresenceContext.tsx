import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSocket } from './SocketContext';
import axios from 'axios';

interface PresenceContextType {
  getUserStatus: (userId: string) => { status: string; lastSeen?: string | null };
  formatLastSeen: (lastSeen: string) => string;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

interface PresenceProviderProps {
  children: ReactNode;
}

export const PresenceProvider: React.FC<PresenceProviderProps> = ({ children }) => {
  const { socket, isConnected } = useSocket();
  const [users, setUsers] = useState<{ [userId: string]: { status: string; lastSeen?: string | null } }>({});
  
  // Fetch initial online status from API
  const fetchInitialStatuses = React.useCallback(async () => {
    try {
      const response = await axios.get('/users/online-status');
      if (response.data.success && response.data.statuses) {
        const newUsers: { [key: string]: { status: string; lastSeen?: string | null } } = {};
        Object.entries(response.data.statuses).forEach(([userId, status]: [string, any]) => {
          // Only set lastSeen for offline users
          newUsers[userId] = { 
            status: status.status, 
            ...(status.status === 'online' ? { lastSeen: null } : { lastSeen: status.lastSeen || null })
          };
        });
        console.log('Loaded initial presence data:', newUsers);
        setUsers(newUsers);
      }
    } catch (error) {
      console.error('Failed to fetch initial presence data:', error);
    }
  }, []);

  useEffect(() => {
    fetchInitialStatuses();
  }, [fetchInitialStatuses]);

  // Refetch presence data when socket connects/reconnects to ensure sync
  useEffect(() => {
    if (socket && isConnected) {
      // Small delay to let server process connection
      const timeout = setTimeout(() => {
        fetchInitialStatuses();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [socket, isConnected, fetchInitialStatuses]);

  useEffect(() => {
    if (!socket) return;

    // Listen for user coming online
    const handleUserOnline = (data: { userId: string; lastSeen?: string }) => {
      console.log('User came online:', data.userId);
      setUsers(prev => ({
        ...prev,
        [data.userId]: { status: 'online', lastSeen: null } // Online users don't show lastSeen
      }));
    };

    // Listen for user going offline
    const handleUserOffline = (data: { userId: string; lastSeen: string }) => {
      console.log('User went offline:', data.userId);
      setUsers(prev => ({
        ...prev,
        [data.userId]: { status: 'offline', lastSeen: data.lastSeen }
      }));
    };

    // Listen for status updates (online/away)
    const handleStatusUpdate = (data: { userId: string; status: string; lastSeen?: string }) => {
      console.log('User status updated:', data.userId, data.status);
      setUsers(prev => ({
        ...prev,
        [data.userId]: { 
          status: data.status, 
          lastSeen: data.status === 'online' ? null : (data.lastSeen || null) 
        }
      }));
    };

    // Listen for initial list of online users
    const handleOnlineUsersList = (userIds: string[]) => {
      console.log('Received online users list:', userIds);
      setUsers(prev => {
        const newUsers = { ...prev };
        // Mark all users in the list as online
        userIds.forEach(userId => {
          newUsers[userId] = { status: 'online', lastSeen: null };
        });
        return newUsers;
      });
    };

    // Register all event listeners
    socket.on('user-online', handleUserOnline);
    socket.on('user-offline', handleUserOffline);
    socket.on('user-status-update', handleStatusUpdate);
    socket.on('online-users-list', handleOnlineUsersList);

    return () => {
      socket.off('user-online', handleUserOnline);
      socket.off('user-offline', handleUserOffline);
      socket.off('user-status-update', handleStatusUpdate);
      socket.off('online-users-list', handleOnlineUsersList);
    };
  }, [socket]);

  const getUserStatus = (userId: string) => {
    return users[userId] || { status: 'offline', lastSeen: null };
  };

  const formatLastSeen = (lastSeen: string) => {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
  };

  return (
    <PresenceContext.Provider value={{ getUserStatus, formatLastSeen }}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = () => {
  const context = useContext(PresenceContext);
  if (!context) throw new Error('usePresence must be used within PresenceProvider');
  return context;
};
