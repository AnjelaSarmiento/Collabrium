import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeftIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  HeartIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  TrashIcon,
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
    completedCollaborations: number;
  };
  createdAt: string;
  deletedAt: string;
  upvoteCount: number;
  commentCount: number;
  views: number;
  status: string;
  collaborators: Array<{
    user: string;
    joinedAt: string;
  }>;
  comments: Array<{
    _id: string;
    author: {
      _id: string;
      name: string;
      profilePicture: string;
    };
    content: string;
    createdAt: string;
    replies: Array<{
      _id: string;
      author: {
        _id: string;
        name: string;
        profilePicture: string;
      };
      content: string;
      createdAt: string;
    }>;
  }>;
  remainingDays: number;
}

const BinPostDetail: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<DeletedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId]);

  const fetchPost = async () => {
    try {
      const response = await axios.get(`/posts/bin/${postId}`);
      setPost(response.data.post);
    } catch (error) {
      console.error('Failed to fetch deleted post:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!post) return;
    
    try {
      await axios.post(`/posts/bin/${post._id}/restore`);
      navigate('/app/feed');
    } catch (error: any) {
      console.error('Failed to restore post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to restore the post. Please try again.');
      }
    }
  };

  const handlePermanentDelete = async () => {
    if (!post) return;
    
    try {
      await axios.delete(`/posts/bin/${post._id}/permanent`);
      navigate('/app/bin');
    } catch (error: any) {
      console.error('Failed to permanently delete post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to permanently delete the post. Please try again.');
      }
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

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-secondary-900 mb-4">Post not found</h2>
          <Link to="/app/bin" className="btn-primary">
            Back to Bin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/app/bin"
          className="inline-flex items-center text-secondary-600 dark:text-[var(--text-secondary)] hover:text-secondary-900 dark:hover:text-[var(--text-primary)] mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Bin
        </Link>
      </div>

      {/* Post Content */}
      <div className="card mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center">
            <img
              src={post.author.profilePicture || '/default-avatar.png'}
              alt={post.author.name}
              className="h-12 w-12 rounded-full"
            />
            <div className="ml-4">
              <Link 
                to={`/app/profile/${post.author._id}`}
                className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors duration-200"
              >
                {post.author.name}
              </Link>
              <div className="flex items-center">
                <span className="text-sm text-secondary-500 dark:text-[var(--text-secondary)]">
                  ⭐ {post.author.rating.toFixed(1)} • {post.author.completedCollaborations} collaborations
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
              post.type === 'Paid Task'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
            }`}>
              {post.type}
            </span>
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
              Deleted
            </span>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-secondary-900 dark:text-[var(--text-primary)] mb-4">
          {post.title}
        </h1>
        
        <p className="text-secondary-600 dark:text-[var(--text-secondary)] text-lg mb-6 whitespace-pre-wrap">
          {post.description}
        </p>

        {post.reward && (
            <div className="flex items-center text-green-600 dark:text-green-300 font-medium text-lg mb-6">
            <CurrencyDollarIcon className="h-5 w-5 mr-2" />
            {post.reward} CollabPoints
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 bg-secondary-100 dark:bg-[var(--bg-hover)] text-secondary-700 dark:text-[var(--text-primary)] text-sm rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Metadata Footer - Clean Single Row Layout */}
        <div className="border-t border-secondary-200 dark:border-[var(--border-color)] pt-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-secondary-500 dark:text-[var(--text-secondary)]">
            {/* Left Side - Dates and Status */}
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center">
                <ClockIcon className="h-4 w-4 mr-2 text-secondary-400 dark:text-[var(--text-muted)]" />
                <span>Created {formatDate(post.createdAt)}</span>
              </div>
              <div className="flex items-center">
                <TrashIcon className="h-4 w-4 mr-2 text-secondary-400 dark:text-[var(--text-muted)]" />
                <span>Deleted {formatDate(post.deletedAt)}</span>
              </div>
              <div className={`flex items-center font-medium ${getDaysRemainingColor(post.remainingDays)}`}>
                <ClockIcon className="h-4 w-4 mr-2" />
                <span>{post.remainingDays} days remaining</span>
              </div>
            </div>
            
            {/* Right Side - Stats */}
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center">
                <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2 text-secondary-400 dark:text-[var(--text-muted)]" />
                <span>{post.commentCount} comments</span>
              </div>
              <div className="flex items-center">
                <UserGroupIcon className="h-4 w-4 mr-2 text-secondary-400 dark:text-[var(--text-muted)]" />
                <span>{post.collaborators.length} collaborators</span>
              </div>
              <div className="flex items-center">
                <HeartIcon className="h-4 w-4 mr-2 text-secondary-400 dark:text-[var(--text-muted)]" />
                <span>{post.upvoteCount} upvotes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={() => setShowRestoreConfirm(true)}
            className="btn-primary flex items-center"
          >
            <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
            Restore Post
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger flex items-center"
          >
            <XMarkIcon className="h-4 w-4 mr-2" />
            Delete Forever
          </button>
        </div>
      </div>

      {/* Comments Section */}
      <div className="card">
        <h3 className="text-xl font-semibold text-secondary-900 dark:text-[var(--text-primary)] mb-4">Comments</h3>
        
        <div className="space-y-4">
          {post.comments.map((comment) => (
            <div key={comment._id} className="border-l-2 border-secondary-200 dark:border-[var(--border-color)] pl-4">
              <div className="flex space-x-3">
                <img
                  src={comment.author.profilePicture || '/default-avatar.png'}
                  alt={comment.author.name}
                  className="h-8 w-8 rounded-full"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-secondary-900 dark:text-[var(--text-primary)]">
                        {comment.author.name}
                      </span>
                      <span className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="text-secondary-600 dark:text-[var(--text-secondary)] mb-2">{comment.content}</p>
                  
                  {/* Replies */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="ml-6 space-y-3 mt-3">
                      {comment.replies.map((reply) => (
                        <div key={reply._id} className="flex space-x-3">
                          <img
                            src={reply.author.profilePicture || '/default-avatar.png'}
                            alt={reply.author.name}
                            className="h-6 w-6 rounded-full"
                          />
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-secondary-900 dark:text-[var(--text-primary)] text-sm">
                                {reply.author.name}
                              </span>
                              <span className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                                {formatDate(reply.createdAt)}
                              </span>
                            </div>
                            <p className="text-secondary-600 dark:text-[var(--text-secondary)] text-sm">{reply.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {post.comments.length === 0 && (
            <p className="text-secondary-500 dark:text-[var(--text-secondary)] text-center py-4">
              No comments on this deleted post.
            </p>
          )}
        </div>
      </div>

      {/* Restore Confirmation Dialog */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg p-6 max-w-md w-full mx-4 border border-secondary-200 dark:border-[var(--border-color)]">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)] mb-4">
              Restore Post
            </h3>
            <p className="text-secondary-600 dark:text-[var(--text-secondary)] mb-6">
              Are you sure you want to restore this post? It will be moved back to the main feed.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleRestore}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center"
              >
                <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
                Restore
              </button>
              <button
                onClick={() => setShowRestoreConfirm(false)}
                className="flex-1 bg-secondary-200 dark:bg-[var(--bg-hover)] text-secondary-800 dark:text-[var(--text-primary)] px-4 py-2 rounded-md hover:bg-secondary-300 dark:hover:bg-[var(--bg-panel)] transition-colors"
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
          <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg p-6 max-w-md w-full mx-4 border border-secondary-200 dark:border-[var(--border-color)]">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)] mb-4">
              Permanently Delete Post
            </h3>
            <p className="text-secondary-600 dark:text-[var(--text-secondary)] mb-6">
              Are you sure you want to permanently delete this post? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handlePermanentDelete}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center justify-center"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Delete Forever
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-secondary-200 dark:bg-[var(--bg-hover)] text-secondary-800 dark:text-[var(--text-primary)] px-4 py-2 rounded-md hover:bg-secondary-300 dark:hover:bg-[var(--bg-panel)] transition-colors"
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

export default BinPostDetail;
