import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface MuteDurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDuration: (durationMinutes: number | null) => void; // null means "Until I unmute"
  conversationName?: string;
}

const MuteDurationModal: React.FC<MuteDurationModalProps> = ({
  isOpen,
  onClose,
  onSelectDuration,
  conversationName = 'this conversation',
}) => {
  if (!isOpen) return null;

  const durations = [
    { label: '15 minutes', minutes: 15 },
    { label: '1 hour', minutes: 60 },
    { label: '8 hours', minutes: 480 },
    { label: '24 hours', minutes: 1440 },
    { label: 'Until I unmute', minutes: null },
  ];

  const handleSelect = (minutes: number | null) => {
    onSelectDuration(minutes);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-secondary-900">Mute Conversation</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        
        <p className="text-sm text-secondary-600 mb-6">
          How long would you like to mute <strong>{conversationName}</strong>? You won't receive notifications during this time, but you'll still see unread messages in your inbox.
        </p>

        <div className="space-y-2">
          {durations.map((duration) => (
            <button
              key={duration.minutes ?? 'forever'}
              onClick={() => handleSelect(duration.minutes)}
              className="w-full text-left px-4 py-3 text-sm font-medium text-secondary-700 bg-secondary-50 rounded-md hover:bg-secondary-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {duration.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-md hover:bg-secondary-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MuteDurationModal;

