/**
 * NotificationDispatcherContext
 * 
 * React context for the unified NotificationDispatcher.
 * Provides dispatcher instance and hooks for components.
 */

import React, { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { notificationDispatcher, DispatchedUpdate } from '../services/NotificationDispatcher';

interface NotificationDispatcherContextType {
  dispatcher: typeof notificationDispatcher;
}

const NotificationDispatcherContext = createContext<NotificationDispatcherContextType | undefined>(undefined);

interface NotificationDispatcherProviderProps {
  children: ReactNode;
}

export const NotificationDispatcherProvider: React.FC<NotificationDispatcherProviderProps> = ({ children }) => {
  return (
    <NotificationDispatcherContext.Provider value={{ dispatcher: notificationDispatcher }}>
      {children}
    </NotificationDispatcherContext.Provider>
  );
};

export const useNotificationDispatcher = () => {
  const context = useContext(NotificationDispatcherContext);
  if (context === undefined) {
    throw new Error('useNotificationDispatcher must be used within NotificationDispatcherProvider');
  }
  return context.dispatcher;
};

/**
 * Hook to subscribe to dispatched updates
 */
export const useDispatchedUpdates = (callback: (update: DispatchedUpdate) => void) => {
  const dispatcher = useNotificationDispatcher();
  const callbackRef = useRef(callback);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  useEffect(() => {
    const unsubscribe = dispatcher.onDispatch((update) => {
      callbackRef.current(update);
    });
    
    return unsubscribe;
  }, [dispatcher]);
};

