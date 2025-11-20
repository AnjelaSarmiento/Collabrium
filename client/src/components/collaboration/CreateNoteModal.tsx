import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

interface CreateNoteModalProps {
  roomId: string;
  conversationId: string;
  onClose: () => void;
}

const CreateNoteModal: React.FC<CreateNoteModalProps> = ({ roomId, conversationId, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    content: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      const response = await axios.post(`/collaboration/rooms/${roomId}/notes`, {
        title: formData.title,
        content: formData.content
      });

      if (response.data.success) {
        onClose();
      }
    } catch (error: any) {
      console.error('[CreateNoteModal] Failed to create note:', error);
      alert(error.response?.data?.message || 'Failed to create note');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl border border-secondary-200 dark:border-[var(--border-color)] max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-secondary-200 dark:border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)]">Take Note</h3>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-secondary-600 dark:text-[var(--text-muted)] dark:hover:text-[var(--text-secondary)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 flex-1 flex flex-col">
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full input-field"
              required
              placeholder="Note title"
            />
          </div>

          <div className="flex-1 flex flex-col">
            <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-1">
              Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full input-field flex-1"
              placeholder="Note content (supports markdown)"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateNoteModal;

