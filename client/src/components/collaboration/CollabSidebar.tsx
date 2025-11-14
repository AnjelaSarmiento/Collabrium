import React, { useState } from 'react';
import {
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  FolderIcon,
  UsersIcon,
  XMarkIcon,
  ChevronRightIcon,
  ChevronLeftIcon
} from '@heroicons/react/24/outline';
import TasksTab from './TasksTab';
import TodosTab from './TodosTab';
import NotesTab from './NotesTab';
import FilesTab from './FilesTab';
import ParticipantsTab from './ParticipantsTab';

interface CollabSidebarProps {
  roomId: string;
  participants: Array<{
    user: {
      _id: string;
      name: string;
      profilePicture: string;
    };
    role: string;
  }>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

type TabType = 'tasks' | 'todos' | 'notes' | 'files' | 'participants';

const CollabSidebar: React.FC<CollabSidebarProps> = ({
  roomId,
  participants,
  isCollapsed,
  onToggleCollapse
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');

  const tabs = [
    { id: 'tasks' as TabType, label: 'Tasks', icon: ClipboardDocumentListIcon },
    { id: 'todos' as TabType, label: 'To-dos', icon: CheckCircleIcon },
    { id: 'notes' as TabType, label: 'Notes', icon: DocumentTextIcon },
    { id: 'files' as TabType, label: 'Files', icon: FolderIcon },
    { id: 'participants' as TabType, label: 'Participants', icon: UsersIcon }
  ];

  if (isCollapsed) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-secondary-200 w-16 flex flex-col items-center py-2 h-full">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-secondary-100 rounded-lg transition-colors"
          title="Expand sidebar"
        >
          <ChevronLeftIcon className="h-5 w-5 text-secondary-600" />
        </button>
        <div className="flex-1 flex flex-col items-center gap-2 mt-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  onToggleCollapse();
                }}
                className={`p-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-600'
                    : 'text-secondary-600 hover:bg-secondary-100'
                }`}
                title={tab.label}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-secondary-200 w-80 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-secondary-200 flex items-center justify-between">
        <h3 className="text-lg font-medium text-secondary-900">
          {tabs.find(t => t.id === activeTab)?.label}
        </h3>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-secondary-100 rounded transition-colors"
          title="Collapse sidebar"
        >
          <ChevronRightIcon className="h-5 w-5 text-secondary-600" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-secondary-200 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-secondary-600 hover:bg-secondary-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'tasks' && <TasksTab roomId={roomId} />}
        {activeTab === 'todos' && <TodosTab roomId={roomId} />}
        {activeTab === 'notes' && <NotesTab roomId={roomId} />}
        {activeTab === 'files' && <FilesTab roomId={roomId} />}
        {activeTab === 'participants' && <ParticipantsTab participants={participants} />}
      </div>
    </div>
  );
};

export default CollabSidebar;

