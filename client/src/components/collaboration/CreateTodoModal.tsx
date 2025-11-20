import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

interface CreateTodoModalProps {
  roomId: string;
  conversationId: string;
  onClose: () => void;
}

const CreateTodoModal: React.FC<CreateTodoModalProps> = ({ roomId, conversationId, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      const response = await axios.post(`/collaboration/rooms/${roomId}/todos`, {
        title: formData.title,
        description: formData.description
      });

      if (response.data.success) {
        onClose();
      }
    } catch (error: any) {
      console.error('[CreateTodoModal] Failed to create todo:', error);
      alert(error.response?.data?.message || 'Failed to create todo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl border border-secondary-200 dark:border-[var(--border-color)] max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b border-secondary-200 dark:border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)]">Add To-do</h3>
          <button
            onClick={onClose}
            className="text-secondary-400 hover:text-secondary-600 dark:text-[var(--text-muted)] dark:hover:text-[var(--text-secondary)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
              placeholder="To-do title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full input-field"
              rows={3}
              placeholder="To-do description (optional)"
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
              {loading ? 'Adding...' : 'Add To-do'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTodoModal;

