import React, { createContext, useContext, useState, ReactNode } from 'react';

interface OpenWidget {
  type: 'dm' | 'room';
  conversationId: string;
  roomId?: string;
  otherUser?: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  roomName?: string;
}

interface MessagesWidgetContextType {
  isDropdownOpen: boolean;
  openDropdown: () => void;
  closeDropdown: () => void;
  openWidgets: OpenWidget[];
  openDMWidget: (conversationId: string, otherUser: { _id: string; name: string; profilePicture?: string }) => void;
  openRoomWidget: (conversationId: string, roomId: string, roomName: string) => void;
  closeWidget: (conversationId: string) => void;
  closeAllWidgets: () => void;
}

const MessagesWidgetContext = createContext<MessagesWidgetContextType | undefined>(undefined);

export const MessagesWidgetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openWidgets, setOpenWidgets] = useState<OpenWidget[]>([]);

  const openDropdown = () => setIsDropdownOpen(true);
  const closeDropdown = () => setIsDropdownOpen(false);

  const openDMWidget = (conversationId: string, otherUser: { _id: string; name: string; profilePicture?: string }) => {
    setOpenWidgets(prev => {
      // Don't add if already open
      if (prev.some(w => w.conversationId === conversationId)) return prev;
      return [...prev, { type: 'dm', conversationId, otherUser }];
    });
    closeDropdown();
  };

  const openRoomWidget = (conversationId: string, roomId: string, roomName: string) => {
    setOpenWidgets(prev => {
      // Don't add if already open
      if (prev.some(w => w.conversationId === conversationId)) return prev;
      return [...prev, { type: 'room', conversationId, roomId, roomName }];
    });
    closeDropdown();
  };

  const closeWidget = (conversationId: string) => {
    setOpenWidgets(prev => prev.filter(w => w.conversationId !== conversationId));
  };

  const closeAllWidgets = () => {
    setOpenWidgets([]);
  };

  return (
    <MessagesWidgetContext.Provider
      value={{
        isDropdownOpen,
        openDropdown,
        closeDropdown,
        openWidgets,
        openDMWidget,
        openRoomWidget,
        closeWidget,
        closeAllWidgets,
      }}
    >
      {children}
    </MessagesWidgetContext.Provider>
  );
};

export const useMessagesWidget = () => {
  const context = useContext(MessagesWidgetContext);
  if (!context) {
    throw new Error('useMessagesWidget must be used within MessagesWidgetProvider');
  }
  return context;
};

