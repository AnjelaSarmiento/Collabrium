import React, { memo } from 'react';

interface TypingIndicatorProps {
  userName: string;
  isVisible: boolean;
}

/**
 * Lightweight TypingIndicator component with React.memo for performance
 * Prevents unnecessary re-renders of the chat tree when typing state changes
 */
const TypingIndicator: React.FC<TypingIndicatorProps> = memo(({ userName, isVisible }) => {
  // Pre-reserve height to prevent layout shifts (20px min-height)
  return (
    <div 
      className="text-xs text-[#3D61D4]"
      aria-live="polite"
      aria-label={isVisible ? `${userName} is typing` : undefined}
      style={{
        minHeight: '20px',
        height: isVisible ? 'auto' : '20px',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.15s ease-in-out',
        overflow: 'hidden'
      }}
    >
      {isVisible && (
        <span className="animate-pulse">
          Typing…
        </span>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if visibility or userName actually changes
  return prevProps.isVisible === nextProps.isVisible && 
         prevProps.userName === nextProps.userName;
});

TypingIndicator.displayName = 'TypingIndicator';

export default TypingIndicator;

