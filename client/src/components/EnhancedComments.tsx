import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import UserHoverCard from './UserHoverCard';
import { getProfileImageUrl } from '../utils/image';

interface Comment {
  _id: string;
  author: {
    _id: string;
    name: string;
    profilePicture: string;
  } | null;
  content: string;
  createdAt: string;
  upvotes?: Array<{
    user: string;
    createdAt: string;
  }>;
  replies: Reply[];
}

interface Reply {
  _id: string;
  author: {
    _id: string;
    name: string;
    profilePicture: string;
  } | null;
  content: string;
  createdAt: string;
  upvotes?: Array<{
    user: string;
    createdAt: string;
  }>;
  replyTo?: {
    userId: string;
    userName: string;
    replyId?: string;
  };
}

interface EnhancedCommentsProps {
  postId: string;
  comments: Comment[];
  onCommentUpdate: () => void;
}

interface CommentItemProps {
  comment: Comment;
  postId: string;
  onCommentUpdate: () => void;
  level?: number;
}

interface ReplyItemProps {
  reply: Reply;
  commentId: string;
  postId: string;
  onCommentUpdate: () => void;
  level?: number;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) {
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else {
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
      return `${diffInDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }
};

const ReplyItem: React.FC<ReplyItemProps> = ({ reply, commentId, postId, onCommentUpdate, level = 0 }) => {
  const { user } = useAuth();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [upvoting, setUpvoting] = useState(false);

  const authorId = reply.author?._id;
  const authorName = reply.author?.name || 'Unknown';
  const authorPicture = reply.author?.profilePicture;

  const hasUserUpvoted = reply.upvotes?.some(upvote => upvote.user === user?._id) || false;
  const upvoteCount = reply.upvotes?.length || 0;
  const [localHasUpvoted, setLocalHasUpvoted] = useState<boolean>(hasUserUpvoted);
  const [localCount, setLocalCount] = useState<number>(upvoteCount);

  useEffect(() => {
    setLocalHasUpvoted(hasUserUpvoted);
    setLocalCount(upvoteCount);
  }, [hasUserUpvoted, upvoteCount, reply._id]);

  const handleUpvote = async () => {
    if (!user || upvoting) return;
    
    setUpvoting(true);
    try {
      // Optimistic toggle
      setLocalHasUpvoted(prev => !prev);
      setLocalCount(prev => (localHasUpvoted ? Math.max(0, prev - 1) : prev + 1));
      const response = await axios.post(`/posts/${postId}/comment/${commentId}/reply/${reply._id}/upvote`);
      // Sync with server response
      const data = response.data || {};
      if (typeof data.upvoteCount === 'number') setLocalCount(data.upvoteCount);
      if (typeof data.upvoted === 'boolean') setLocalHasUpvoted(data.upvoted);
      // Also refresh to stay consistent
      onCommentUpdate();
    } catch (error: any) {
      console.error('Failed to upvote reply:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
      // Revert optimistic on error
      setLocalHasUpvoted(hasUserUpvoted);
      setLocalCount(upvoteCount);
    } finally {
      setUpvoting(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    try {
      const payload: any = { content: replyContent };
      if (authorId && authorName) {
        payload.replyTo = {
          userId: authorId,
          userName: authorName,
          replyId: reply._id,
        };
      }
      await axios.post(`/posts/${postId}/comment/${commentId}/reply`, payload);
      setReplyContent('');
      setReplyingTo(null);
      onCommentUpdate();
    } catch (error: any) {
      console.error('Failed to add reply:', error);
    }
  };

  const maxIndentation = level >= 3;
  const marginClass = maxIndentation ? 'ml-0' : `ml-${Math.min(level * 6, 12)}`;

  return (
    <div id={`reply-${reply._id}`} className={`${marginClass} ${!maxIndentation ? 'border-l border-gray-200 dark:border-[var(--border-color)] pl-4' : ''} py-3`}>
      <div className="flex space-x-3">
        {authorId ? (
          <UserHoverCard userId={authorId}>
            <img
              src={getProfileImageUrl(authorPicture) || '/default-avatar.png'}
              alt={authorName}
              className="h-8 w-8 rounded-full flex-shrink-0 cursor-pointer"
            />
          </UserHoverCard>
        ) : (
          <img
            src={getProfileImageUrl(authorPicture) || '/default-avatar.png'}
            alt={authorName}
            className="h-8 w-8 rounded-full flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {authorId ? (
              <UserHoverCard userId={authorId}>
                <Link 
                  to={`/app/profile/${authorId}`}
                  className="font-medium text-secondary-900 dark:text-[var(--text-primary)] text-sm hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors duration-200"
                >
                  {authorName}
                </Link>
              </UserHoverCard>
            ) : (
              <span className="font-medium text-secondary-900 dark:text-[var(--text-primary)] text-sm">{authorName}</span>
            )}
            {reply.replyTo && (
              <span className="text-xs text-secondary-400 dark:text-[var(--text-secondary)]">
                • replied to {reply.replyTo.userName}
              </span>
            )}
            <span className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
              {formatDate(reply.createdAt)}
            </span>
          </div>
          
          <p className="text-secondary-700 dark:text-[var(--text-primary)] text-sm mb-2 break-words">{reply.content}</p>
          
          <div className="flex items-center space-x-4">
            {/* Upvote Button */}
            <button
              onClick={handleUpvote}
              disabled={upvoting}
              className={`flex items-center space-x-1 text-xs font-medium transition-colors duration-200 ${
                localHasUpvoted
                  ? 'text-primary-600 hover:text-primary-700'
                  : 'text-secondary-500 hover:text-secondary-700'
              } disabled:opacity-50`}
            >
              {localHasUpvoted ? (
                <HeartSolidIcon className="h-4 w-4" />
              ) : (
                <HeartIcon className="h-4 w-4" />
              )}
              <span>{localCount}</span>
            </button>
            
            {/* Reply Button - Only show if not too deep */}
            {level < 3 && (
              <button
                onClick={() => setReplyingTo(replyingTo === reply._id ? null : reply._id)}
                className="text-xs text-primary-600 dark:text-[var(--link-color)] hover:text-primary-700 dark:hover:text-[var(--link-color)]/80 font-medium transition-colors duration-200"
              >
                Reply
              </button>
            )}
          </div>

          {/* Reply Form */}
          {replyingTo === reply._id && (
            <form onSubmit={handleReply} className="mt-3 space-y-2">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Reply to ${authorName}...`}
                className="w-full p-2 text-sm border border-secondary-300 dark:border-[var(--border-color)] rounded-md bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] focus:ring-1 focus:ring-primary-500 dark:focus:ring-[var(--link-color)] focus:border-primary-500 dark:focus:border-[var(--link-color)] resize-none"
                rows={2}
                maxLength={300}
              />
              <div className="flex space-x-2">
                <button
                  type="submit"
                  disabled={!replyContent.trim()}
                  className="px-3 py-1 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="px-3 py-1 text-xs bg-secondary-200 dark:bg-[var(--bg-hover)] text-secondary-700 dark:text-[var(--text-primary)] rounded-md hover:bg-secondary-300 dark:hover:bg-[var(--bg-panel)] transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const CommentItem: React.FC<CommentItemProps> = ({ comment, postId, onCommentUpdate, level = 0 }) => {
  const { user } = useAuth();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [upvoting, setUpvoting] = useState(false);

  const authorId = comment.author?._id;
  const authorName = comment.author?.name || 'Unknown';
  const authorPicture = comment.author?.profilePicture;

  const hasUserUpvoted = comment.upvotes?.some(upvote => upvote.user === user?._id) || false;
  const upvoteCount = comment.upvotes?.length || 0;
  const [localHasUpvoted, setLocalHasUpvoted] = useState<boolean>(hasUserUpvoted);
  const [localCount, setLocalCount] = useState<number>(upvoteCount);

  useEffect(() => {
    setLocalHasUpvoted(hasUserUpvoted);
    setLocalCount(upvoteCount);
  }, [hasUserUpvoted, upvoteCount, comment._id]);

  const handleUpvote = async () => {
    if (!user || upvoting) return;
    
    setUpvoting(true);
    try {
      // Optimistic toggle
      setLocalHasUpvoted(prev => !prev);
      setLocalCount(prev => (localHasUpvoted ? Math.max(0, prev - 1) : prev + 1));
      const response = await axios.post(`/posts/${postId}/comment/${comment._id}/upvote`);
      // Sync with server response
      const data = response.data || {};
      if (typeof data.upvoteCount === 'number') setLocalCount(data.upvoteCount);
      if (typeof data.upvoted === 'boolean') setLocalHasUpvoted(data.upvoted);
      // Also refresh to stay consistent with backend grouping/state
      onCommentUpdate();
    } catch (error: any) {
      console.error('Failed to upvote comment:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
      // Revert optimistic on error
      setLocalHasUpvoted(hasUserUpvoted);
      setLocalCount(upvoteCount);
    } finally {
      setUpvoting(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    try {
      const payload: any = { content: replyContent };
      if (authorId && authorName) {
        payload.replyTo = {
          userId: authorId,
          userName: authorName,
          replyId: null,
        };
      }
      await axios.post(`/posts/${postId}/comment/${comment._id}/reply`, payload);
      setReplyContent('');
      setReplyingTo(null);
      onCommentUpdate();
    } catch (error: any) {
      console.error('Failed to add reply:', error);
    }
  };

  return (
    <div id={`comment-${comment._id}`} className="py-4 border-b border-secondary-100 dark:border-[var(--border-color)] last:border-b-0">
      <div className="flex space-x-3">
        {authorId ? (
          <UserHoverCard userId={authorId}>
            <img
              src={getProfileImageUrl(authorPicture) || '/default-avatar.png'}
              alt={authorName}
              className="h-10 w-10 rounded-full flex-shrink-0 cursor-pointer"
            />
          </UserHoverCard>
        ) : (
          <img
            src={getProfileImageUrl(authorPicture) || '/default-avatar.png'}
            alt={authorName}
            className="h-10 w-10 rounded-full flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {authorId ? (
              <UserHoverCard userId={authorId}>
                <Link 
                  to={`/app/profile/${authorId}`}
                  className="font-semibold text-secondary-900 dark:text-[var(--text-primary)] hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors duration-200"
                >
                  {authorName}
                </Link>
              </UserHoverCard>
            ) : (
              <span className="font-semibold text-secondary-900 dark:text-[var(--text-primary)]">{authorName}</span>
            )}
            <span className="text-sm text-secondary-500 dark:text-[var(--text-secondary)]">
              {formatDate(comment.createdAt)}
            </span>
          </div>
          
          <p className="text-secondary-700 dark:text-[var(--text-primary)] mb-3 break-words">{comment.content}</p>
          
          <div className="flex items-center space-x-4 mb-3">
            {/* Upvote Button */}
            <button
              onClick={handleUpvote}
              disabled={upvoting}
            className={`flex items-center space-x-1 text-sm font-medium transition-colors duration-200 ${
                localHasUpvoted
                  ? 'text-primary-600 dark:text-[var(--link-color)] hover:text-primary-700 dark:hover:text-[var(--link-color)]/80'
                  : 'text-secondary-500 dark:text-[var(--text-secondary)] hover:text-secondary-700 dark:hover:text-[var(--text-primary)]'
              } disabled:opacity-50`}
            >
              {localHasUpvoted ? (
                <HeartSolidIcon className="h-4 w-4" />
              ) : (
                <HeartIcon className="h-4 w-4" />
              )}
              <span>{localCount}</span>
            </button>
            
            {/* Reply Button */}
            <button
              onClick={() => setReplyingTo(replyingTo === comment._id ? null : comment._id)}
              className="text-sm text-primary-600 dark:text-[var(--link-color)] hover:text-primary-700 dark:hover:text-[var(--link-color)]/80 font-medium transition-colors duration-200"
            >
              Reply
            </button>
          </div>

          {/* Reply Form */}
          {replyingTo === comment._id && (
            <form onSubmit={handleReply} className="mb-4 space-y-3">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Reply to ${authorName}...`}
                className="w-full p-3 border border-secondary-300 dark:border-[var(--border-color)] rounded-lg bg-white dark:bg-[var(--bg-card)] text-secondary-900 dark:text-[var(--text-primary)] focus:ring-1 focus:ring-primary-500 dark:focus:ring-[var(--link-color)] focus:border-primary-500 dark:focus:border-[var(--link-color)] resize-none"
                rows={3}
                maxLength={300}
              />
              <div className="flex space-x-2">
                <button
                  type="submit"
                  disabled={!replyContent.trim()}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="px-4 py-2 text-sm bg-secondary-200 dark:bg-[var(--bg-hover)] text-secondary-700 dark:text-[var(--text-primary)] rounded-lg hover:bg-secondary-300 dark:hover:bg-[var(--bg-panel)] transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="space-y-0">
              {comment.replies.map((reply) => (
                <ReplyItem
                  key={reply._id}
                  reply={reply}
                  commentId={comment._id}
                  postId={postId}
                  onCommentUpdate={onCommentUpdate}
                  level={1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EnhancedComments: React.FC<EnhancedCommentsProps> = ({ postId, comments, onCommentUpdate }) => {
  const { socket } = useSocket();

  // Listen for real-time reaction updates to refresh comment/reply upvote counts
  useEffect(() => {
    if (!socket || !postId) return;

    const handleReactionUpdate = (data: {
      postId: string;
      type: 'post' | 'comment' | 'reply';
      targetType?: 'post' | 'comment' | 'reply';
      commentId?: string;
      replyId?: string;
      upvoted: boolean;
      upvoteCount: number;
      userId: string;
    }) => {
      if (data.postId !== postId) return;

      console.log('[EnhancedComments] Reaction update received:', data);
      
      // For comment/reply upvotes, trigger a refresh to update all counts
      if (data.type === 'comment' || data.type === 'reply') {
        console.log('[EnhancedComments] Refreshing comments for upvote update');
        onCommentUpdate();
      }
    };

    socket.on('reaction:updated', handleReactionUpdate);

    return () => {
      socket.off('reaction:updated', handleReactionUpdate);
    };
  }, [socket, postId, onCommentUpdate]);

  return (
    <div className="space-y-0">
      {comments.length > 0 ? (
        comments.map((comment) => (
          <CommentItem
            key={comment._id}
            comment={comment}
            postId={postId}
            onCommentUpdate={onCommentUpdate}
            level={0}
          />
        ))
      ) : (
        <div className="text-center py-8">
          <p className="text-secondary-500 dark:text-[var(--text-secondary)]">No comments yet. Be the first to comment!</p>
        </div>
      )}
    </div>
  );
};

export default EnhancedComments;
