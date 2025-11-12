import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeftIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  HeartIcon,
  PencilIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import EnhancedComments from '../components/EnhancedComments';
import UserHoverCard from '../components/UserHoverCard';
import { getProfileImageUrl } from '../utils/image';
import { highlightPost } from '../utils/highlight';

interface Post {
  _id: string;
  title: string;
  description: string;
  type: 'Free Collaboration' | 'Paid Task';
  reward?: number;
  tags: string[];
  deadline?: string;
  isUrgent: boolean;
  author: {
    _id: string;
    name: string;
    profilePicture: string;
    rating: number;
    completedCollaborations: number;
  };
  createdAt: string;
  upvoteCount: number;
  commentCount: number;
  views: number;
  status: string;
  maxCollaborators?: number; // 0 or undefined => unlimited
  collabOpen?: boolean; // whether requests are accepted
  collaborators: Array<{
    user: string | {
      _id: string;
      name: string;
      profilePicture?: string;
    };
    joinedAt: string;
  }>;
  roomId?: string;
  // Optional list of upvotes; if present, used to show highlight state
  upvotes?: Array<{
    user: string;
    createdAt?: string;
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
    upvotes?: Array<{
      user: string;
      createdAt: string;
    }>;
    replies: Array<{
      _id: string;
      author: {
        _id: string;
        name: string;
        profilePicture: string;
      };
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
    }>;
  }>;
}

const PostDetail: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchParams] = useSearchParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [comment, setComment] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMax, setSettingsMax] = useState<number | ''>('');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(true);
  // Local optimistic state for post-level upvote highlight and count
  const [localPostHasUpvoted, setLocalPostHasUpvoted] = useState<boolean>(false);
  const [localPostCount, setLocalPostCount] = useState<number>(0);
  // Collaboration request state
  const [myRequest, setMyRequest] = useState<{ _id: string; status: string; requestedAt: string; respondedAt?: string } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Array<{ _id: string; requester: { _id: string; name: string; profilePicture: string; rating: number; completedCollaborations: number }; requestedAt: string }>>([]);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [activeCollabTab, setActiveCollabTab] = useState<'requests' | 'settings' | 'collaborators'>('requests');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Check if we came from profile page
  const fromProfile = searchParams.get('from') === 'profile';
  const userId = searchParams.get('userId');
  
  // Determine back button text and destination
  const backButtonText = fromProfile ? 'Back to Profile' : 'Back to CollabFeed';
  const backButtonLink = fromProfile && userId ? `/app/profile/${userId}` : '/app/feed';

  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId]);

  useEffect(() => {
    if (postId && user) {
      fetchMyRequest();
    }
  }, [postId, user]);

  useEffect(() => {
    if (postId && user && post && post.author._id === user._id) {
      fetchPendingRequests();
    }
  }, [postId, user, post]);

  const fetchPost = async () => {
    try {
      const response = await axios.get(`/posts/${postId}`);
      const fetchedPost = response.data.post as Post;
      setPost(fetchedPost);
      
      // Log roomId for debugging
      if (fetchedPost.roomId) {
        console.log('[PostDetail] Post has roomId:', {
          postId: fetchedPost._id,
          roomId: fetchedPost.roomId,
          roomIdType: typeof fetchedPost.roomId
        });
      } else {
        console.log('[PostDetail] Post has no roomId:', {
          postId: fetchedPost._id,
          status: fetchedPost.status,
          collaboratorsCount: fetchedPost.collaborators?.length || 0
        });
      }
      
      // Initialize owner controls when post loads
      setSettingsMax(typeof fetchedPost.maxCollaborators === 'number' ? fetchedPost.maxCollaborators : 0);
      setSettingsOpen(fetchedPost.collabOpen ?? true);
    } catch (error) {
      console.error('Failed to fetch post:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelMyRequest = async () => {
    if (!post || !myRequest?._id) return;
    try {
      await axios.delete(`/posts/${post._id}/cancel-request/${myRequest._id}`);
      await fetchMyRequest();
      alert('Your collaboration request was cancelled.');
    } catch (error: any) {
      console.error('Failed to cancel request:', error);
      alert(error.response?.data?.message || 'Failed to cancel request.');
    }
  };

  // Sync local optimistic state when post changes
  useEffect(() => {
    if (post) {
      setLocalPostCount(post.upvoteCount ?? 0);
      const userId = user?._id;
      const has = !!post.upvotes?.some((u: any) => (u.user?._id || u.user) === userId);
      setLocalPostHasUpvoted(has);
    }
  }, [post, user?._id]);

  // Join post room for real-time updates
  useEffect(() => {
    if (!socket || !postId) return;

    // Join the post room to receive real-time updates
    socket.emit('join-room', `post:${postId}`);
    console.log('[PostDetail] Joined post room:', `post:${postId}`);

    return () => {
      // Leave the post room when component unmounts
      socket.emit('leave-room', `post:${postId}`);
      console.log('[PostDetail] Left post room:', `post:${postId}`);
    };
  }, [socket, postId]);

  // Listen for real-time updates when comments, replies, or reactions are added
  useEffect(() => {
    if (!socket || !postId) return;

    // Handle post activity events (for UI refresh - not notifications)
    const handlePostActivity = (data: {
      type: string;
      postId: string;
      commentId?: string;
      replyId?: string;
    }) => {
      // Check if this activity is relevant to the current post
      if (data.postId !== postId) return;

      if (data.type === 'comment_added' || data.type === 'reply_added') {
        console.log('[PostDetail] Post activity received, refetching post:', data.type);
        // Refetch post to get updated comments/replies
        fetchPost();
      }
    };

    // Handle notification events (only for notifications, not UI refresh)
    const handleNotification = (data: {
      type: string;
      metadata?: { postId?: string; commentId?: string; replyId?: string };
    }) => {
      // Only handle reaction notifications here (upvotes) - comments/replies use post:activity
      const isRelevant = 
        data.metadata?.postId === postId &&
        (data.type === 'post_reaction_added' || 
         data.type === 'reaction_added');
      
      if (isRelevant) {
        console.log('[PostDetail] Relevant notification received, refetching post:', data.type);
        // Refetch post to get updated reactions
        fetchPost();
      }
    };

    // Listen for reaction updates (upvote/un-upvote)
    const handleReactionUpdate = (data: {
      postId: string;
      type: 'post' | 'comment' | 'reply';
      targetType?: 'post' | 'comment' | 'reply';
      targetId?: string;
      commentId?: string;
      replyId?: string;
      upvoted: boolean; // true for upvote, false for un-upvote
      upvoteCount: number;
      userId: string;
    }) => {
      if (data.postId !== postId) return;

      console.log('[PostDetail] Reaction update received:', data);
      console.log('[PostDetail] Upvoted:', data.upvoted, 'Count:', data.upvoteCount);
      
      // Update post state immediately for real-time UI update
      if (data.type === 'post') {
        // Update local post count for both upvote and un-upvote
        setLocalPostCount(data.upvoteCount);
        console.log('[PostDetail] Updated post upvote count to:', data.upvoteCount);
      } else {
        // For comments/replies, refetch the post to get updated data
        // This ensures all comment/reply upvote counts and states are correct
        console.log('[PostDetail] Refetching post for comment/reply upvote update');
        fetchPost();
      }
    };

    socket.on('post:activity', handlePostActivity);
    socket.on('notification', handleNotification);
    socket.on('reaction:updated', handleReactionUpdate);

    return () => {
      socket.off('post:activity', handlePostActivity);
      socket.off('notification', handleNotification);
      socket.off('reaction:updated', handleReactionUpdate);
    };
  }, [socket, postId]);

  // Listen for collaboration request status updates (from notifications)
  useEffect(() => {
    if (!socket || !postId || !user) return;

    const handleCollaborationNotification = (data: any) => {
      if (
        (data.type === 'collaboration_request_approved' || 
         data.type === 'collaboration_request_declined') &&
        data.metadata?.postId === postId
      ) {
        console.log('[PostDetail] Collaboration request status changed via notification:', data.type);
        // Refresh post to get updated collaborators and roomId
        fetchPost();
        // Refresh request status
        fetchMyRequest();
      }
    };

    socket.on('notification', handleCollaborationNotification);

    return () => {
      socket.off('notification', handleCollaborationNotification);
    };
  }, [socket, postId, user]);

  // Refresh data when navigating to post (especially from notifications)
  // This ensures the Enter Room button appears after approval
  useEffect(() => {
    if (postId && user && !loading) {
      // Small delay to ensure navigation is complete
      const timer = setTimeout(() => {
        console.log('[PostDetail] Refreshing collaboration data on mount/navigation');
        fetchPost();
        fetchMyRequest();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [postId, user?._id]); // Refresh when postId or user changes (navigation)

  // Track if we've already highlighted for the current URL params to prevent re-highlighting on post refetch
  const highlightedRef = React.useRef<string>('');

  // Check for highlight parameters and apply highlighting
  // Only highlight when navigating from notifications (indicated by highlight/reply URL params)
  useEffect(() => {
    if (post && postId && !loading) {
      const highlightId = searchParams.get('highlight');
      const replyId = searchParams.get('reply');
      
      // Create a unique key for this highlight request
      const highlightKey = `${postId}-${highlightId || ''}-${replyId || ''}`;
      
      // Only highlight if we have highlight/reply params AND we haven't highlighted this combination yet
      if ((highlightId || replyId) && highlightedRef.current !== highlightKey) {
        // Mark this highlight combination as processed
        highlightedRef.current = highlightKey;
        
        // Wait for content to render, especially comments
        // Use a retry mechanism to wait for comments to be fully rendered
        const attemptHighlight = (retries = 5, delay = 500): void => {
          // If highlight is "post", highlight the post itself
          if (highlightId === 'post') {
            highlightPost(postId);
            // Clear URL params after highlighting to prevent re-highlighting on post refetch
            setTimeout(() => {
              navigate(`/app/feed/${postId}`, { replace: true });
            }, 2500); // Clear after highlight animation completes
            return;
          }
          
          // Otherwise, highlightId is a commentId
          // Convert null to undefined (searchParams.get returns string | null)
          const commentId = highlightId && highlightId !== 'post' ? highlightId : undefined;
          const replyIdParam = replyId || undefined;
          
          console.log('[PostDetail] Attempting to highlight:', { postId, commentId, replyId: replyIdParam, retries });
          
          // Check if the comment element exists
          if (commentId) {
            const commentElement = document.getElementById(`comment-${commentId}`);
            if (commentElement) {
              console.log('[PostDetail] Comment element found, highlighting:', commentId);
              highlightPost(postId, commentId, replyIdParam);
              // Clear URL params after highlighting to prevent re-highlighting on post refetch
              setTimeout(() => {
                navigate(`/app/feed/${postId}`, { replace: true });
              }, 2500); // Clear after highlight animation completes
              return;
            } else if (retries > 0) {
              console.log(`[PostDetail] Comment element not found yet, retrying in ${delay}ms (${retries} retries left)`);
              setTimeout(() => attemptHighlight(retries - 1, delay * 1.2), delay);
              return;
            } else {
              console.warn(`[PostDetail] Comment element not found after all retries: comment-${commentId}`);
              // Clear URL params even if element not found
              setTimeout(() => {
                navigate(`/app/feed/${postId}`, { replace: true });
              }, 500);
            }
          }
          
          // Check if the reply element exists
          if (replyIdParam) {
            const replyElement = document.getElementById(`reply-${replyIdParam}`);
            if (replyElement) {
              console.log('[PostDetail] Reply element found, highlighting:', replyIdParam);
              highlightPost(postId, commentId, replyIdParam);
              // Clear URL params after highlighting to prevent re-highlighting on post refetch
              setTimeout(() => {
                navigate(`/app/feed/${postId}`, { replace: true });
              }, 2500); // Clear after highlight animation completes
              return;
            } else if (retries > 0) {
              console.log(`[PostDetail] Reply element not found yet, retrying in ${delay}ms (${retries} retries left)`);
              setTimeout(() => attemptHighlight(retries - 1, delay * 1.2), delay);
              return;
            } else {
              console.warn(`[PostDetail] Reply element not found after all retries: reply-${replyIdParam}`);
              // Clear URL params even if element not found
              setTimeout(() => {
                navigate(`/app/feed/${postId}`, { replace: true });
              }, 500);
            }
          }
          
          // If we have a commentId but element not found, don't highlight post (fallback)
          // Only highlight post if we were trying to highlight the post itself
          if (highlightId === 'post' || (!commentId && !replyIdParam)) {
            console.log('[PostDetail] Highlighting post as fallback');
            highlightPost(postId);
            // Clear URL params after highlighting
            setTimeout(() => {
              navigate(`/app/feed/${postId}`, { replace: true });
            }, 2500);
          } else {
            console.warn('[PostDetail] Comment/reply not found, skipping highlight to avoid incorrect post highlighting');
            // Clear URL params even if we can't highlight
            setTimeout(() => {
              navigate(`/app/feed/${postId}`, { replace: true });
            }, 500);
          }
        };
        
        // Start highlighting after initial delay
        setTimeout(() => attemptHighlight(), 600);
      } else if (!highlightId && !replyId) {
        // Reset highlight tracking when URL params are cleared
        highlightedRef.current = '';
      }
      // If no highlight/reply params, don't highlight (normal browsing)
    }
  }, [post, postId, searchParams, loading, navigate]);

  const fetchMyRequest = async () => {
    if (!postId || !user) return;
    try {
      const response = await axios.get(`/posts/${postId}/my-request`);
      setMyRequest(response.data.request);
    } catch (error) {
      console.error('Failed to fetch my request:', error);
      setMyRequest(null);
    }
  };

  const fetchPendingRequests = async () => {
    if (!postId || !user || !post || post.author._id !== user._id) return;
    setLoadingRequest(true);
    try {
      const response = await axios.get(`/posts/${postId}/requests`);
      setPendingRequests(response.data.requests || []);
    } catch (error) {
      console.error('Failed to fetch pending requests:', error);
      setPendingRequests([]);
    } finally {
      setLoadingRequest(false);
    }
  };

  const handleRequestCollaboration = async () => {
    if (!post) return;
    
    setJoining(true);
    try {
      await axios.post(`/posts/${post._id}/request-collaboration`);
      // Refresh request status
      await fetchMyRequest();
      // Show success message
      alert('Collaboration request sent! The post owner will be notified.');
    } catch (error: any) {
      console.error('Failed to send collaboration request:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to send collaboration request. Please try again.');
      }
    } finally {
      setJoining(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (!post) return;
    try {
      const response = await axios.post(`/posts/${post._id}/approve-request/${requestId}`);
      // Refresh post and requests to get updated roomId
      await fetchPost();
      await fetchPendingRequests();
      
      // If room was created, show success message with room info
      if (response.data.room) {
        alert(`Collaboration request approved! Room "${response.data.room.name}" has been created.`);
      } else {
        alert('Collaboration request approved!');
      }
    } catch (error: any) {
      console.error('Failed to approve request:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to approve request. Please try again.');
      }
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!post) return;
    try {
      await axios.post(`/posts/${post._id}/decline-request/${requestId}`);
      // Refresh requests
      await fetchPendingRequests();
      alert('Collaboration request declined.');
    } catch (error: any) {
      console.error('Failed to decline request:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to decline request. Please try again.');
      }
    }
  };

  const handleEnterRoom = async () => {
    if (!post?.roomId) {
      console.error('[PostDetail] No roomId in post:', post);
      alert('Room ID not found. Please refresh the page and try again.');
      return;
    }
    const roomIdStr = String(post.roomId);
    console.log('[PostDetail] Navigating to room:', {
      roomId: roomIdStr,
      roomIdType: typeof post.roomId,
      postId: post._id
    });
    
    // Verify room exists before navigating
    try {
      const response = await axios.get(`/rooms/${roomIdStr}`);
      if (response.data.success && response.data.room) {
        navigate(`/app/room/${roomIdStr}`);
      } else {
        alert('Room not found. It may have been deleted.');
      }
    } catch (error: any) {
      console.error('[PostDetail] Room verification failed:', error);
      if (error.response?.status === 404) {
        alert('Room not found. The room may not exist or you may not have access.');
      } else if (error.response?.status === 403) {
        alert('Access denied. You are not a participant in this room.');
      } else {
        alert('Failed to verify room access. Please try again.');
      }
    }
  };

  const handleUpvote = async () => {
    if (!post) return;
    
    // Optimistically toggle local state irrespective of post.upvotes presence
    const prevCount = localPostCount;
    const prevHas = localPostHasUpvoted;
    setLocalPostHasUpvoted(!prevHas);
    setLocalPostCount(prevHas ? Math.max(0, prevCount - 1) : prevCount + 1);
    
    try {
      const response = await axios.post(`/posts/${post._id}/upvote`);
      console.log('Upvote response:', response.data);
      
      // Sync count with server response; keep highlight as toggled
      if (typeof response.data?.upvoteCount === 'number') {
        setLocalPostCount(response.data.upvoteCount);
      }
    } catch (error) {
      console.error('Failed to upvote post:', error);
      // Revert optimistic update on error
      setLocalPostHasUpvoted(prevHas);
      setLocalPostCount(prevCount);
      alert('Failed to upvote post. Please try again.');
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !post) return;

    try {
      await axios.post(`/posts/${post._id}/comment`, {
        content: comment
      });
      setComment('');
      // Refresh post data to show new comment
      await fetchPost();
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    
    console.log('Delete attempt:', {
      postId: post._id,
      postAuthorId: post.author._id,
      userId: user?._id,
      isOwner: user && post.author._id === user._id
    });
    
    try {
      const response = await axios.delete(`/posts/${post._id}`);
      console.log('Delete response:', response.data);
      navigate(backButtonLink);
    } catch (error: any) {
      console.error('Failed to delete post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to delete the post. Please try again.');
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
          <Link to={backButtonLink} className="btn-primary">
            {backButtonText}
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
          to={backButtonLink}
          className="inline-flex items-center text-secondary-600 hover:text-secondary-900 mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          {backButtonText}
        </Link>
      </div>

      {/* Post Content */}
      <div id={`post-${post._id}`} className="card mb-6">
        {/* Header - Matching CollabFeed style */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <UserHoverCard userId={post.author._id}>
              <img
                src={getProfileImageUrl(post.author.profilePicture) || '/default-avatar.png'}
                alt={post.author.name}
                className="h-8 w-8 rounded-full flex-shrink-0"
              />
            </UserHoverCard>
            <UserHoverCard userId={post.author._id}>
              <Link 
                to={`/app/profile/${post.author._id}`}
                className="text-sm font-medium text-gray-700 truncate hover:text-primary-600 transition-colors duration-200"
              >
                {post.author.name}
              </Link>
            </UserHoverCard>
            <span className="text-xs text-gray-500">
              ⭐ {post.author.rating.toFixed(1)} • {post.author.completedCollaborations} collabs
            </span>
          </div>
          
          {/* Badges - Matching CollabFeed style */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {/* Type Badge - Simplified */}
            <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${
              post.type === 'Paid Task'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {post.type === 'Paid Task' ? 'Paid' : 'Free'}
            </span>
            
            {/* Urgent Badge */}
            {post.isUrgent && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-amber-50 text-amber-600 border border-amber-200">
                ⚡ Urgent
              </span>
            )}
            
            {/* Reward Amount - Only show if Paid Task */}
            {post.type === 'Paid Task' && post.reward && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">
                🪙 {post.reward} CP
              </span>
            )}
            
            {/* Edit/Delete buttons for post creator */}
            {user && post.author._id === user._id && (
              <div className="relative" ref={actionsMenuRef}>
                <button
                  onClick={() => setActionsOpen(v => !v)}
                  className="p-1 text-gray-400 hover:text-secondary-700 transition-colors"
                  title="More actions"
                >
                  <EllipsisHorizontalIcon className="h-5 w-5" />
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 mt-2 w-44 bg-white border border-secondary-200 rounded-lg shadow-lg z-20">
                <Link
                  to={`/app/feed/edit/${post._id}`}
                      className="block px-3 py-2 text-sm text-secondary-700 hover:bg-secondary-50"
                      onClick={() => setActionsOpen(false)}
                >
                      Edit Post
                </Link>
                <button
                      onClick={() => {
                        setActionsOpen(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete Post
                </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <h1 className="text-3xl font-bold text-secondary-900 mb-4 break-words">
          {post.title}
        </h1>
        
        <p className="text-secondary-600 text-lg mb-6 whitespace-pre-wrap break-words break-all">
          {post.description}
        </p>

        {/* Tags - Matching CollabFeed style */}
        <div className="flex flex-wrap gap-1 mb-6">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-sm"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between text-sm text-secondary-500 mb-6">
          <div className="flex items-center space-x-6">
            <div className="flex items-center">
              <ClockIcon className="h-4 w-4 mr-1" />
              {formatDate(post.createdAt)}
            </div>
            {post.deadline && (
              <div className="flex items-center text-orange-600">
                <ClockIcon className="h-4 w-4 mr-1" />
                Due {formatDate(post.deadline)}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex items-center">
              <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" />
              {post.commentCount} comments
            </div>
            <div className="flex items-center">
              <UserGroupIcon className="h-4 w-4 mr-1" />
              {(() => {
                const currentApproved = post?.collaborators?.length || 0;
                const max = post?.maxCollaborators || 0;
                return (
                  <span className="text-secondary-600">
                    {currentApproved} / {max > 0 ? max : '∞'}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center">
              <HeartIcon className="h-4 w-4 mr-1" />
              {localPostCount} upvotes
            </div>
            {/* Status badge and collaborator count */}
            {(() => {
              const currentApproved = post?.collaborators?.length || 0;
              const max = post?.maxCollaborators || 0;
              const isFull = max > 0 && currentApproved >= max;
              const accepting = (post?.collabOpen ?? true) && !isFull;
              let badgeText = 'Open';
              if (post?.status === 'In Progress') {
                badgeText = accepting ? 'In Progress — Accepting Requests' : 'In Progress — Requests Closed';
              }
              return (
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded text-xs font-medium ${accepting ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {badgeText}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={handleUpvote}
            className="btn-secondary flex items-center"
          >
            {localPostHasUpvoted ? (
              <HeartSolidIcon className="h-4 w-4 mr-2 text-primary-600" />
            ) : (
              <HeartIcon className="h-4 w-4 mr-2" />
            )}
            Upvote ({localPostCount})
          </button>
          {/* Collaboration Request/Status Button */}
          {(post.status === 'Open' || post.status === 'In Progress') && user && post.author._id !== user._id && (
            (() => {
              const isCollaborator = post.collaborators.some(c => {
                const userId = typeof c.user === 'string' ? c.user : (c.user?._id || c.user);
                return userId === user._id;
              });
              const requestStatus = myRequest?.status;
              const currentApproved = post.collaborators.length;
              const max = post.maxCollaborators || 0;
              const isFull = max > 0 && currentApproved >= max;
              const accepting = (post.collabOpen ?? true) && !isFull;
              
              if (isCollaborator) {
                // User is already a collaborator - show Enter Room button if room exists
                // Note: We show the button if roomId exists, but handleEnterRoom will verify the room exists
                return post.roomId ? (
                  <button
                    onClick={handleEnterRoom}
                    className="btn-primary"
                  >
                    Enter Room
                  </button>
                ) : (
                  <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                    Collaborator
                  </span>
                );
              } else if (requestStatus === 'pending') {
                return (
                  <div className="flex items-center gap-2">
                    <button
                      disabled
                      className="btn-secondary opacity-50 cursor-not-allowed"
                    >
                      Request Sent
                    </button>
                    <button
                      onClick={handleCancelMyRequest}
                      className="px-3 py-2 bg-gray-100 text-secondary-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                );
              } else if (requestStatus === 'approved') {
                // Show Enter Room button if roomId exists
                // handleEnterRoom will verify the room exists before navigating
                return post.roomId ? (
                  <button
                    onClick={handleEnterRoom}
                    className="btn-primary"
                  >
                    Enter Room
                  </button>
                ) : (
                  <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                    Approved
                  </span>
                );
              } else if (requestStatus === 'declined') {
                return (
                  <button
                    onClick={handleRequestCollaboration}
                    disabled={joining}
                    className="btn-secondary"
                  >
                    {joining ? 'Sending...' : 'Request Again'}
                  </button>
                );
              } else if (!accepting) {
                return (
                  <button
                    disabled
                    className="btn-secondary opacity-50 cursor-not-allowed"
                  >
                    Requests Closed
                  </button>
                );
              } else {
                // No request yet
                return (
                  <button
                    onClick={handleRequestCollaboration}
              disabled={joining}
              className="btn-primary"
            >
                    {joining ? 'Sending...' : 'Request Collaboration'}
            </button>
                );
              }
            })()
          )}
        </div>
        
        {/* Owner: Enter Room button (if room exists) */}
        {user && post.author._id === user._id && post.roomId && (
          <div className="mt-6">
            <button
              onClick={handleEnterRoom}
              className="btn-primary"
            >
              Enter Room
            </button>
          </div>
        )}
        
        {/* Owner: Collaboration management */}
        {user && post.author._id === user._id && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-secondary-900 mb-3">Collaboration Management</h2>
            <div className="bg-white border border-secondary-200 rounded-lg overflow-hidden">
              <div className="flex border-b border-secondary-200 bg-secondary-50">
                <TabButton
                  label={`Requests${pendingRequests.length ? ` (${pendingRequests.length})` : ''}`}
                  isActive={activeCollabTab === 'requests'}
                  onClick={() => setActiveCollabTab('requests')}
                />
                <TabButton
                  label="Collaborators"
                  isActive={activeCollabTab === 'collaborators'}
                  onClick={() => setActiveCollabTab('collaborators')}
                />
                <TabButton
                  label="Settings"
                  isActive={activeCollabTab === 'settings'}
                  onClick={() => setActiveCollabTab('settings')}
                />
              </div>
              <div className="p-4">
                {activeCollabTab === 'requests' && (
                  <RequestsTab
                    pendingRequests={pendingRequests}
                    onApprove={handleApproveRequest}
                    onDecline={handleDeclineRequest}
                    loading={loadingRequest}
                    postStatus={post.status}
                  />
                )}
                {activeCollabTab === 'collaborators' && (
                  <CollaboratorsTab
                    collaborators={post.collaborators}
                    onRemove={async (collaboratorId: string) => {
                      if (!post) return;
                      const confirm = window.confirm('Remove this collaborator from the post? They will also lose room access.');
                      if (!confirm) return;
                      try {
                        await axios.post(`/posts/${post._id}/remove-collaborator/${collaboratorId}`);
                        await fetchPost();
                      } catch (error: any) {
                        console.error('Failed to remove collaborator:', error);
                        alert(error.response?.data?.message || 'Failed to remove collaborator.');
                      }
                    }}
                  />
                )}
                {activeCollabTab === 'settings' && (
                  <SettingsTab
                    settingsMax={settingsMax}
                    onSettingsMaxChange={setSettingsMax}
                    settingsOpen={settingsOpen}
                    onSettingsOpenChange={setSettingsOpen}
                    onSave={async () => {
                      if (!post) return;
                      try {
                        setSavingSettings(true);
                        const payload: any = {
                          collabOpen: settingsOpen
                        };
                        const normalizedMax = settingsMax === '' ? 0 : settingsMax;
                        payload.maxCollaborators = normalizedMax;
                        const res = await axios.put(`/posts/${post._id}`, payload);
                        setPost(res.data.post);
                        setSettingsMax(typeof res.data.post.maxCollaborators === 'number' ? res.data.post.maxCollaborators : 0);
                        setSettingsOpen(res.data.post.collabOpen ?? true);
                        alert('Collaboration settings saved.');
                      } catch (error: any) {
                        console.error('Failed to save settings:', error);
                        alert(error.response?.data?.message || 'Failed to save settings.');
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    saving={savingSettings}
                    currentCount={post.collaborators.length}
                    max={post.maxCollaborators}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comments Section */}
      <div className="card">
        <h3 className="text-xl font-semibold text-secondary-900 mb-4">Comments</h3>
        
        {/* Comment Form */}
        <form onSubmit={handleComment} className="mb-6">
          <div className="flex space-x-3">
            <input
              type="text"
              placeholder="Add a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="flex-1 input-field"
            />
            <button type="submit" className="btn-primary">
              Comment
            </button>
          </div>
        </form>

        {/* Enhanced Comments List */}
        <EnhancedComments 
          postId={post._id}
          comments={post.comments}
          onCommentUpdate={fetchPost}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">
              Delete Post
            </h3>
            <p className="text-secondary-600 mb-6">
              Are you sure you want to delete this post? It will be moved to your bin and can be restored within 30 days.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
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

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'text-primary-700 border-b-2 border-primary-600 bg-white'
        : 'text-secondary-500 hover:text-secondary-700'
    }`}
  >
    {label}
  </button>
);

interface RequestsTabProps {
  pendingRequests: Array<{
    _id: string;
    requester: { _id: string; name: string; profilePicture: string; rating: number; completedCollaborations: number };
    requestedAt: string;
  }>;
  loading: boolean;
  postStatus: string;
  onApprove: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

const RequestsTab: React.FC<RequestsTabProps> = ({
  pendingRequests,
  loading,
  postStatus,
  onApprove,
  onDecline
}) => {
  if (loading) {
    return <p className="text-sm text-secondary-500">Loading requests…</p>;
  }

  if (!pendingRequests.length) {
    return (
      <div className="text-sm text-secondary-500 space-y-2">
        <p>No pending collaboration requests right now.</p>
        {postStatus !== 'Open' && (
          <p className="italic">This post is currently {postStatus}. Re-open requests in the Settings tab to accept new collaborators.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingRequests.map((req) => (
        <div key={req._id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-3">
            <UserHoverCard userId={req.requester._id}>
              <img
                src={getProfileImageUrl(req.requester.profilePicture) || '/default-avatar.png'}
                alt={req.requester.name}
                className="h-10 w-10 rounded-full cursor-pointer"
              />
            </UserHoverCard>
            <div>
              <UserHoverCard userId={req.requester._id}>
                <Link
                  to={`/app/profile/${req.requester._id}`}
                  className="font-medium text-secondary-900 hover:text-primary-600 transition-colors"
                >
                  {req.requester.name}
                </Link>
              </UserHoverCard>
              <p className="text-sm text-secondary-500">
                ⭐ {req.requester.rating.toFixed(1)} • {req.requester.completedCollaborations} collabs
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(req._id)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Approve
            </button>
            <button
              onClick={() => onDecline(req._id)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface CollaboratorsTabProps {
  collaborators: Post['collaborators'];
  onRemove?: (collaboratorId: string) => void;
}

const CollaboratorsTab: React.FC<CollaboratorsTabProps> = ({ collaborators, onRemove }) => {
  if (!collaborators.length) {
    return <p className="text-sm text-secondary-500">No collaborators yet. Approved collaborators will appear here.</p>;
  }

  return (
    <div className="space-y-3">
      {collaborators.map((collab) => {
        const userData = typeof collab.user === 'string' ? null : collab.user;
        const collaboratorId = userData?._id || (typeof collab.user === 'string' ? collab.user : '');
        const displayName = userData?.name || 'Collaborator';
        const avatar = getProfileImageUrl(userData?.profilePicture) || '/default-avatar.png';

        return (
          <div key={`${collaboratorId}-${collab.joinedAt}`} className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg border border-secondary-200">
            <div className="flex items-center gap-3">
              {userData ? (
                <UserHoverCard userId={userData._id}>
                  <img src={avatar} alt={displayName} className="h-10 w-10 rounded-full cursor-pointer" />
                </UserHoverCard>
              ) : (
                <img src={avatar} alt={displayName} className="h-10 w-10 rounded-full" />
              )}
              <div>
                {userData ? (
                  <UserHoverCard userId={userData._id}>
                    <Link
                      to={`/app/profile/${userData._id}`}
                      className="font-medium text-secondary-900 hover:text-primary-600 transition-colors"
                    >
                      {displayName}
                    </Link>
                  </UserHoverCard>
                ) : (
                  <p className="font-medium text-secondary-900">{displayName}</p>
                )}
                <p className="text-xs text-secondary-500">
                  Joined {new Date(collab.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            {onRemove && collaboratorId && (
              <button
                onClick={() => onRemove(collaboratorId)}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface SettingsTabProps {
  settingsMax: number | '';
  settingsOpen: boolean;
  currentCount: number;
  max?: number;
  saving: boolean;
  onSettingsMaxChange: React.Dispatch<React.SetStateAction<number | ''>>;
  onSettingsOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  onSave: () => void | Promise<void>;
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  settingsMax,
  settingsOpen,
  currentCount,
  max,
  saving,
  onSettingsMaxChange,
  onSettingsOpenChange,
  onSave
}) => (
  <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-secondary-700 mb-1">
          Maximum Collaborators (0 = unlimited)
        </label>
        <input
          type="number"
          min={0}
          value={settingsMax}
          onChange={(e) => {
            const v = e.target.value;
            const n = Number(v);
            if (v === '') onSettingsMaxChange('');
            else onSettingsMaxChange(Number.isNaN(n) ? 0 : Math.max(0, n));
          }}
          className="input-field w-full"
        />
        <p className="text-xs text-secondary-500 mt-1">
          Current: {currentCount} / {max && max > 0 ? max : '∞'}
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-secondary-700 mb-1">
          Accept Requests
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={settingsOpen}
          onClick={() => onSettingsOpenChange(!settingsOpen)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settingsOpen ? 'bg-green-600' : 'bg-gray-300'
          }`}
          title={settingsOpen ? 'Accepting requests (click to close)' : 'Requests closed (click to open)'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settingsOpen ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
          <span className="sr-only">Toggle Accept Requests</span>
        </button>
        <span className="ml-3 text-sm font-medium text-secondary-700">
          {settingsOpen ? 'Open' : 'Closed'}
        </span>
        <p className="text-xs text-secondary-500 mt-1">
          Auto-closes when max is reached.
        </p>
      </div>
    </div>
    <div>
      <button
        onClick={onSave}
        className="btn-primary"
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  </div>
);

export default PostDetail;
