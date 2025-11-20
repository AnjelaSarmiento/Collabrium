import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeftIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';

interface Post {
  _id: string;
  title: string;
  description: string;
  type: 'Free Collaboration' | 'Paid Task';
  reward?: number;
  tags: string[];
  deadline?: string;
  isUrgent: boolean;
  maxCollaborators?: number;
  collabOpen?: boolean;
  collaborators?: Array<{ user: string } | { user: { _id: string } }>;
}

const EditPost: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Free Collaboration' as 'Free Collaboration' | 'Paid Task',
    reward: '',
    tags: [] as string[],
    deadline: '',
    isUrgent: false,
  });
  const [tagInput, setTagInput] = useState('');
  const [maxCollaborators, setMaxCollaborators] = useState<number | ''>(0);
  const [collabOpen, setCollabOpen] = useState(true);

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId]);

  const fetchPost = async () => {
    try {
      const response = await axios.get(`/posts/${postId}`);
      const postData = response.data.post;
      setPost(postData);
      setFormData({
        title: postData.title,
        description: postData.description,
        type: postData.type,
        reward: postData.reward?.toString() || '',
        tags: postData.tags || [],
        deadline: postData.deadline ? new Date(postData.deadline).toISOString().slice(0, 16) : '',
        isUrgent: postData.isUrgent || false,
      });
      setMaxCollaborators(typeof postData.maxCollaborators === 'number' ? postData.maxCollaborators : 0);
      setCollabOpen(postData.collabOpen ?? true);
    } catch (error) {
      console.error('Failed to fetch post:', error);
      alert('Failed to load post for editing');
      navigate('/app/feed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;

    setSaving(true);
    try {
      const updateData = {
        ...formData,
        reward: formData.type === 'Paid Task' ? parseInt(formData.reward) || 0 : undefined,
        deadline: formData.deadline || undefined,
        maxCollaborators: maxCollaborators === '' ? 0 : maxCollaborators,
        collabOpen,
      };

      await axios.put(`/posts/${post._id}`, updateData);
      navigate(`/app/feed/${post._id}`);
    } catch (error: any) {
      console.error('Failed to update post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to update the post. Please try again.');
      }
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-secondary-900 dark:text-[var(--text-primary)] mb-4">Post not found</h2>
          <Link to="/app/feed" className="btn-primary">
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  const collaboratorCount = post.collaborators?.length || 0;
  const hasActiveCollaborators = collaboratorCount > 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/app/feed/${post._id}`}
          className="inline-flex items-center text-secondary-600 dark:text-[var(--text-secondary)] hover:text-secondary-900 dark:hover:text-[var(--text-primary)] mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Post
        </Link>
        <h1 className="text-3xl font-bold text-secondary-900 dark:text-[var(--text-primary)]">Edit Post</h1>
        <p className="mt-2 text-secondary-600 dark:text-[var(--text-secondary)]">
          Update your post details. {hasActiveCollaborators ? 'Core fields are locked because collaborators have already joined, but you can manage collaboration settings below.' : 'You can adjust all details, including collaboration limits.'}
        </p>
      </div>

      {/* Form */}
      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
              Title *
            </label>
            <input
              type="text"
              id="title"
              required
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="input-field"
              placeholder="Enter post title..."
              maxLength={100}
              disabled={hasActiveCollaborators}
            />
            <p className="mt-1 text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
              {formData.title.length}/100 characters
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
              Description *
            </label>
            <textarea
              id="description"
              required
              rows={6}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input-field"
              placeholder="Describe what you're looking for..."
              maxLength={2000}
              disabled={hasActiveCollaborators}
            />
            <p className="mt-1 text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
              {formData.description.length}/2000 characters
            </p>
          </div>

          {/* Type */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
              Type *
            </label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'Free Collaboration' | 'Paid Task' }))}
              className="input-field"
              disabled={hasActiveCollaborators}
            >
              <option value="Free Collaboration">Free Collaboration</option>
              <option value="Paid Task">Paid Task</option>
            </select>
          </div>

          {/* Reward (only for Paid Task) */}
          {formData.type === 'Paid Task' && (
            <div>
              <label htmlFor="reward" className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                <CurrencyDollarIcon className="h-4 w-4 inline mr-1" />
                Reward (CollabPoints) *
              </label>
              <input
                type="number"
                id="reward"
                value={formData.reward}
                onChange={(e) => setFormData(prev => ({ ...prev, reward: e.target.value }))}
                className="input-field"
                placeholder="Enter the reward amount"
                min="1"
                required={formData.type === 'Paid Task'}
                disabled={hasActiveCollaborators}
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
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
                disabled={hasActiveCollaborators}
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
                  disabled={hasActiveCollaborators}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
              Deadline (Optional)
            </label>
            <input
              type="datetime-local"
              id="deadline"
              value={formData.deadline}
              onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
              className="input-field"
              disabled={hasActiveCollaborators}
            />
          </div>

          {/* Urgent */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isUrgent"
              checked={formData.isUrgent}
              onChange={(e) => setFormData(prev => ({ ...prev, isUrgent: e.target.checked }))}
              className="rounded border-secondary-300 dark:border-[var(--border-color)] text-primary-600 focus:ring-primary-500 dark:focus:ring-[var(--link-color)] bg-white dark:bg-[var(--bg-card)]"
              disabled={hasActiveCollaborators}
            />
            <label htmlFor="isUrgent" className="ml-2 text-sm text-secondary-700 dark:text-[var(--text-primary)]">
              Mark as urgent
            </label>
          </div>

          {/* Collaboration Settings */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
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
              <p className="mt-1 text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                Current approved collaborators: {collaboratorCount}.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                Accept Collaboration Requests
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCollabOpen(true)}
                  className={`px-3 py-2 rounded border ${collabOpen ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-[var(--bg-card)] text-secondary-700 dark:text-[var(--text-primary)] border-secondary-300 dark:border-[var(--border-color)]'}`}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setCollabOpen(false)}
                  className={`px-3 py-2 rounded border ${!collabOpen ? 'bg-gray-700 text-white border-gray-700' : 'bg-white dark:bg-[var(--bg-card)] text-secondary-700 dark:text-[var(--text-primary)] border-secondary-300 dark:border-[var(--border-color)]'}`}
                >
                  Closed
                </button>
              </div>
              <p className="mt-1 text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                Requests close automatically when the maximum is reached.
              </p>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex space-x-4 pt-6 border-t border-secondary-200">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? 'Saving...' : 'Update Post'}
            </button>
            <Link
              to={`/app/feed/${post._id}`}
              className="btn-secondary flex-1 text-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPost;
