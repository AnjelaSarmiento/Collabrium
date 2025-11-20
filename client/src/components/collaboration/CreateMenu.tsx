import React, { useState, useRef, useEffect } from 'react';
import {
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import CreateTaskModal from './CreateTaskModal';
import CreateTodoModal from './CreateTodoModal';
import CreateNoteModal from './CreateNoteModal';

interface CreateMenuProps {
  roomId: string;
  conversationId: string;
}

const CreateMenu: React.FC<CreateMenuProps> = ({ roomId, conversationId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'task' | 'todo' | 'note' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleOptionClick = (type: 'task' | 'todo' | 'note') => {
    setActiveModal(type);
    setIsOpen(false);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="btn-secondary p-2 hover:bg-primary-100 hover:text-primary-600 transition-colors"
          title="Create"
        >
          <span className="text-lg font-bold">+</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-lg border border-secondary-200 dark:border-[var(--border-color)] py-2 min-w-[180px] z-50">
            <button
              onClick={() => handleOptionClick('task')}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] transition-colors text-left"
            >
              <ClipboardDocumentListIcon className="h-5 w-5 text-primary-600" />
              <span className="text-sm text-secondary-900 dark:text-[var(--text-primary)]">Create Task</span>
            </button>
            <button
              onClick={() => handleOptionClick('todo')}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] transition-colors text-left"
            >
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              <span className="text-sm text-secondary-900 dark:text-[var(--text-primary)]">Add To-do</span>
            </button>
            <button
              onClick={() => handleOptionClick('note')}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] transition-colors text-left"
            >
              <DocumentTextIcon className="h-5 w-5 text-yellow-600" />
              <span className="text-sm text-secondary-900 dark:text-[var(--text-primary)]">Take Note</span>
            </button>
          </div>
        )}
      </div>

      {activeModal === 'task' && (
        <CreateTaskModal
          roomId={roomId}
          conversationId={conversationId}
          onClose={handleCloseModal}
        />
      )}
      {activeModal === 'todo' && (
        <CreateTodoModal
          roomId={roomId}
          conversationId={conversationId}
          onClose={handleCloseModal}
        />
      )}
      {activeModal === 'note' && (
        <CreateNoteModal
          roomId={roomId}
          conversationId={conversationId}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
};

export default CreateMenu;

