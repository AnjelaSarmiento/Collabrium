import React from 'react';
import { useMessagesWidget } from '../contexts/MessagesWidgetContext';
import ChatWidget from './ChatWidget';
import RoomChatWidget from './RoomChatWidget';

const MessagesWidgetContainer: React.FC = () => {
  const { openWidgets } = useMessagesWidget();

  return (
    <>
      {openWidgets.map((widget, index) => {
        // Position widgets in a stack from right to left
        // Each widget is 420px wide (room) or 320px wide (dm), so we offset by widget width + gap
        const widgetWidth = widget.type === 'room' ? 420 : 320;
        const gap = 16;
        const rightOffset = index * (widgetWidth + gap);
        
        if (widget.type === 'dm' && widget.otherUser) {
          return (
            <ChatWidget
              key={widget.conversationId}
              conversationId={widget.conversationId}
              otherUser={widget.otherUser}
            />
          );
        } else if (widget.type === 'room' && widget.roomId) {
          return (
            <RoomChatWidget
              key={widget.conversationId}
              conversationId={widget.conversationId}
              roomId={widget.roomId}
              roomName={widget.roomName || 'Room'}
            />
          );
        }
        return null;
      })}
    </>
  );
};

export default MessagesWidgetContainer;

