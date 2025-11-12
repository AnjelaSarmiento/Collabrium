import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeftIcon,
  CurrencyDollarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Free Collaboration',
    reward: '',
    tags: [] as string[],
    deadline: '',
    isUrgent: false,
  });
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maxCollaborators, setMaxCollaborators] = useState<number | ''>(0);
  const [collabOpen, setCollabOpen] = useState(true);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim().toLowerCase())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim().toLowerCase()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const postData = {
        title: formData.title,
        description: formData.description,
        type: formData.type,
        reward: formData.type === 'Paid Task' ? parseInt(formData.reward) || 0 : undefined,
        tags: formData.tags,
        deadline: formData.deadline || undefined,
        isUrgent: formData.isUrgent,
        maxCollaborators: maxCollaborators === '' ? 0 : maxCollaborators,
        collabOpen,
      };

      console.log('Sending post data:', postData);

      const response = await axios.post('/posts', postData);
      
      if (response.data.success) {
        navigate('/app/feed');
      } else {
        setError(response.data.message || 'Failed to create post');
      }
    } catch (error: any) {
      console.error('Create post error:', error);
      if (error.response?.data?.errors) {
        const errorMessages = error.response.data.errors.map((err: any) => err.msg).join(', ');
        setError(`Validation failed: ${errorMessages}`);
      } else {
        setError(error.response?.data?.message || 'Failed to create post');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/app/feed')}
          className="flex items-center text-secondary-600 hover:text-secondary-900 mb-4"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to CollabFeed
        </button>
        
        <h1 className="text-3xl font-bold text-secondary-900">Create New Post</h1>
        <p className="mt-2 text-secondary-600">
          Share a collaboration opportunity or paid task with the community
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-secondary-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              className="input-field"
              placeholder="Enter a clear, descriptive title"
              value={formData.title}
              onChange={handleChange}
              maxLength={100}
            />
            <p className="mt-1 text-xs text-secondary-500">
              {formData.title.length}/100 characters
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-secondary-700 mb-2">
              Description *
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={6}
              className="input-field"
              placeholder="Describe your collaboration opportunity or task in detail"
              value={formData.description}
              onChange={handleChange}
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-secondary-500">
              {formData.description.length}/2000 characters
            </p>
          </div>

          {/* Type */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-secondary-700 mb-2">
              Type *
            </label>
            <select
              id="type"
              name="type"
              className="input-field"
              value={formData.type}
              onChange={handleChange}
            >
              <option value="Free Collaboration">Free Collaboration</option>
              <option value="Paid Task">Paid Task</option>
            </select>
          </div>

          {/* Reward (only for Paid Task) */}
          {formData.type === 'Paid Task' && (
            <div>
              <label htmlFor="reward" className="block text-sm font-medium text-secondary-700 mb-2">
                <CurrencyDollarIcon className="h-4 w-4 inline mr-1" />
                Reward (CollabPoints) *
              </label>
              <input
                type="number"
                id="reward"
                name="reward"
                required={formData.type === 'Paid Task'}
                min="1"
                className="input-field"
                placeholder="Enter the reward amount"
                value={formData.reward}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-2">
              <TagIcon className="h-4 w-4 inline mr-1" />
              Tags
            </label>
            <div className="flex space-x-2 mb-3">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 input-field"
                placeholder="Add a tag..."
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn-secondary"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-2 text-primary-600 hover:text-primary-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <p className="mt-1 text-sm text-secondary-500">
              Tags help others find your post. Add tags one by one.
            </p>
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium text-secondary-700 mb-2">
              Deadline (Optional)
            </label>
            <input
              type="datetime-local"
              id="deadline"
              name="deadline"
              value={formData.deadline}
              onChange={handleChange}
              className="input-field"
            />
          </div>

          {/* Urgent */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isUrgent"
              name="isUrgent"
              checked={formData.isUrgent}
              onChange={handleChange}
              className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="isUrgent" className="ml-2 text-sm text-secondary-700">
              Mark as urgent
            </label>
          </div>

          {/* Collaboration Settings */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Maximum Collaborators (0 = unlimited)
              </label>
              <input
                type="number"
                min={0}
                className="input-field"
                value={maxCollaborators}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setMaxCollaborators('');
                  } else {
                    const parsed = parseInt(value, 10);
                    setMaxCollaborators(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }
                }}
              />
              <p className="mt-1 text-xs text-secondary-500">
                Leave blank or set to 0 for unlimited collaborators.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Accept Collaboration Requests
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCollabOpen(true)}
                  className={`px-3 py-2 rounded border ${collabOpen ? 'bg-green-600 text-white border-green-600' : 'bg-white text-secondary-700 border-secondary-300'}`}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setCollabOpen(false)}
                  className={`px-3 py-2 rounded border ${!collabOpen ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-secondary-700 border-secondary-300'}`}
                >
                  Closed
                </button>
              </div>
              <p className="mt-1 text-xs text-secondary-500">
                You can change this anytime after the post is created.
              </p>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex space-x-4 pt-6">
            <button
              type="button"
              onClick={() => navigate('/app/feed')}
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
              {loading ? 'Creating...' : 'Create Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePost;
