import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  TrashIcon,
  ArrowLeftIcon,
  EyeIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  ClockIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface DeletedPost {
  _id: string;
  title: string;
  description: string;
  type: 'Free Collaboration' | 'Paid Task';
  reward?: number;
  tags: string[];
  author: {
    _id: string;
    name: string;
    profilePicture: string;
    rating: number;
  };
  createdAt: string;
  deletedAt: string;
  upvoteCount: number;
  commentCount: number;
  views: number;
  status: string;
  remainingDays: number;
}

const BinPage: React.FC = () => {
  const [posts, setPosts] = useState<DeletedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchDeletedPosts();
  }, []);

  const fetchDeletedPosts = async () => {
    try {
      const response = await axios.get('/posts/bin/user');
      setPosts(response.data.posts);
    } catch (error) {
      console.error('Failed to fetch deleted posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (postId: string) => {
    try {
      await axios.post(`/posts/bin/${postId}/restore`);
      await fetchDeletedPosts();
      setShowRestoreConfirm(null);
    } catch (error: any) {
      console.error('Failed to restore post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to restore the post. Please try again.');
      }
    }
  };

  const handlePermanentDelete = async (postId: string) => {
    try {
      await axios.delete(`/posts/bin/${postId}/permanent`);
      await fetchDeletedPosts();
      setShowDeleteConfirm(null);
    } catch (error: any) {
      console.error('Failed to permanently delete post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to permanently delete the post. Please try again.');
      }
    }
  };

  const handleBulkPermanentDelete = async () => {
    try {
      await axios.delete('/posts/bin/bulk-permanent', {
        data: { postIds: selectedPosts }
      });
      await fetchDeletedPosts();
      setSelectedPosts([]);
      setShowBulkDeleteConfirm(false);
    } catch (error: any) {
      console.error('Failed to permanently delete posts:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to permanently delete the posts. Please try again.');
      }
    }
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPosts(prev => 
      prev.includes(postId) 
        ? prev.filter(id => id !== postId)
        : [...prev, postId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPosts.length === posts.length) {
      setSelectedPosts([]);
    } else {
      setSelectedPosts(posts.map(post => post._id));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDaysRemainingColor = (days: number) => {
    if (days <= 3) return 'text-red-600';
    if (days <= 7) return 'text-orange-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        {/* Back to CollabFeed Link */}
        <div className="mb-6">
          <Link
            to="/app/feed"
            className="inline-flex items-center text-secondary-600 hover:text-secondary-900"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to CollabFeed
          </Link>
        </div>

        {/* Main Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-secondary-900 flex items-center">
              <TrashIcon className="h-8 w-8 mr-3 text-red-500" />
              Bin
            </h1>
            <p className="mt-2 text-secondary-600">
              Manage your deleted posts. Posts are automatically deleted after 30 days.
            </p>
          </div>
          
          {posts.length > 0 && (
            <div className="flex items-center space-x-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedPosts.length === posts.length && posts.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-secondary-600">Select All</span>
              </label>
              
              {selectedPosts.length > 0 && (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="btn-danger flex items-center"
                >
                  <XMarkIcon className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedPosts.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts List */}
      {posts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <TrashIcon className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            Your bin is empty
          </h3>
          <p className="text-secondary-500 mb-6">
            Deleted posts will appear here and can be restored within 30 days.
          </p>
          <Link to="/app/feed" className="btn-primary">
            Go to CollabFeed
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post._id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedPosts.includes(post._id)}
                    onChange={() => togglePostSelection(post._id)}
                    className="mt-1 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-secondary-900 break-words">
                        {post.title}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          post.type === 'Paid Task'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {post.type}
                        </span>
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          Deleted
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-secondary-600 text-sm mb-3 line-clamp-2 break-words break-all overflow-hidden">
                      {post.description}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-secondary-100 text-secondary-700 text-xs rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                      {post.tags.length > 3 && (
                        <span className="px-2 py-1 bg-secondary-100 text-secondary-700 text-xs rounded-full">
                          +{post.tags.length - 3} more
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-secondary-500">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <ClockIcon className="h-4 w-4 mr-1" />
                          Deleted {formatDate(post.deletedAt)}
                        </div>
                        <div className={`flex items-center font-medium ${getDaysRemainingColor(post.remainingDays)}`}>
                          <ClockIcon className="h-4 w-4 mr-1" />
                          {post.remainingDays} days remaining
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span>{post.upvoteCount} upvotes</span>
                        <span>{post.commentCount} comments</span>
                        <span>{post.views} views</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <Link
                    to={`/app/bin/${post._id}`}
                    className="p-2 text-secondary-400 hover:text-primary-600 transition-colors"
                    title="View details"
                  >
                    <EyeIcon className="h-5 w-5" />
                  </Link>
                  <button
                    onClick={() => setShowRestoreConfirm(post._id)}
                    className="p-2 text-secondary-400 hover:text-green-600 transition-colors"
                    title="Restore post"
                  >
                    <ArrowUturnLeftIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(post._id)}
                    className="p-2 text-secondary-400 hover:text-red-600 transition-colors"
                    title="Permanently delete"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Restore Post
            </h3>
            <p className="text-secondary-600 mb-6">
              Are you sure you want to restore this post? It will be moved back to the main feed.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => handleRestore(showRestoreConfirm)}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center"
              >
                <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
                Restore
              </button>
              <button
                onClick={() => setShowRestoreConfirm(null)}
                className="flex-1 bg-secondary-200 text-secondary-800 px-4 py-2 rounded-md hover:bg-secondary-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Permanently Delete Post
            </h3>
            <p className="text-secondary-600 mb-6">
              Are you sure you want to permanently delete this post? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => handlePermanentDelete(showDeleteConfirm)}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center justify-center"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Delete Forever
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 bg-secondary-200 text-secondary-800 px-4 py-2 rounded-md hover:bg-secondary-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Permanently Delete Posts
            </h3>
            <p className="text-secondary-600 mb-6">
              Are you sure you want to permanently delete {selectedPosts.length} selected posts? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleBulkPermanentDelete}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center justify-center"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Delete Forever
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 bg-secondary-200 text-secondary-800 px-4 py-2 rounded-md hover:bg-secondary-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BinPage;
