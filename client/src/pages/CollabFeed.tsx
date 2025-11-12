import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import UserStatusBadge from '../components/UserStatusBadge';
import { getProfileImageUrl } from '../utils/image';

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
  } | null;
  createdAt: string;
  upvoteCount: number;
  commentCount: number;
  views: number;
  status: string;
}

const CollabFeed: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    console.log('CollabFeed - User data:', user);
    fetchPosts();
    if (user) {
      fetchSavedPosts();
    }
  }, [user]);

  // Listen for real-time upvote count updates
  useEffect(() => {
    if (!socket) return;

    const handleReactionUpdate = (data: {
      postId: string;
      type: 'post' | 'comment' | 'reply';
      upvoted: boolean; // true for upvote, false for un-upvote
      upvoteCount: number;
    }) => {
      // Only handle post-level upvote updates (both upvote and un-upvote)
      if (data.type === 'post') {
        console.log('[CollabFeed] Reaction update received:', data);
        console.log('[CollabFeed] Updating post upvote count:', data.postId, 'to', data.upvoteCount, '(upvoted:', data.upvoted, ')');
        setPosts(prevPosts =>
          prevPosts.map(post =>
            post._id === data.postId
              ? { ...post, upvoteCount: data.upvoteCount }
              : post
          )
        );
      }
    };

    socket.on('reaction:updated', handleReactionUpdate);

    return () => {
      socket.off('reaction:updated', handleReactionUpdate);
    };
  }, [socket]);

  const fetchSavedPosts = async () => {
    try {
      const response = await axios.get('/posts/saved');
      console.log('Fetched saved posts:', response.data.posts);
      const savedPostIds = response.data.posts.map((post: Post) => post._id);
      setSavedPosts(new Set(savedPostIds));
      console.log('Set saved posts state:', savedPostIds);
    } catch (error: any) {
      console.error('Failed to fetch saved posts:', error);
    }
  };

  const fetchPosts = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterType) params.append('type', filterType);
      if (filterTag) params.append('tag', filterTag);

      const response = await axios.get(`/posts?${params}`);
      // Filter out posts with null authors and log safely
      const validPosts = response.data.posts.filter((p: Post) => p.author !== null);
      console.log('Posts data:', validPosts.map((p: Post) => ({ 
        id: p._id, 
        title: p.title, 
        authorId: p.author?._id || 'null', 
        authorName: p.author?.name || 'Unknown User'
      })));
      setPosts(validPosts);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setLoading(true);
    fetchPosts();
  };

  const handleJoin = async (postId: string) => {
    try {
      await axios.post(`/posts/${postId}/join`);
      // Refresh posts to show updated collaborator count
      await fetchPosts();
    } catch (error: any) {
      console.error('Failed to join post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to join the collaboration. Please try again.');
      }
    }
  };

  const handleDelete = async (postId: string) => {
    console.log('Delete attempt:', {
      postId,
      userId: user?._id,
      posts: posts
        .filter((p: Post) => p.author !== null)
        .map((p: Post) => ({ 
          id: p._id, 
          authorId: p.author!._id, 
          isOwner: user && p.author!._id === user._id 
        }))
    });
    
    try {
      const response = await axios.delete(`/posts/${postId}`);
      console.log('Delete response:', response.data);
      // Refresh posts to remove deleted post
      await fetchPosts();
      setShowDeleteConfirm(null);
    } catch (error: any) {
      console.error('Failed to delete post:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to delete the post. Please try again.');
      }
    }
  };

  const handleSave = async (postId: string) => {
    console.log('Attempting to save post:', postId);
    console.log('Current user:', user);
    console.log('Current saved posts:', Array.from(savedPosts));
    
    try {
      const response = await axios.post(`/posts/${postId}/save`);
      console.log('Save response:', response.data);
      
      // Update local state to reflect saved status
      setSavedPosts(prev => {
        const newSet = new Set(prev);
        if (response.data.saved) {
          newSet.add(postId);
          console.log('Added post to saved set:', postId);
        } else {
          newSet.delete(postId);
          console.log('Removed post from saved set:', postId);
        }
        console.log('New saved posts set:', Array.from(newSet));
        return newSet;
      });
      
      // Show success feedback
      if (response.data.saved) {
        alert('Post saved successfully!');
      } else {
        alert('Post removed from saved!');
      }
      
    } catch (error: any) {
      console.error('Failed to save post:', error);
      console.error('Error response:', error.response);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Failed to save the post. Please try again.');
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-secondary-900">CollabFeed</h1>
            <p className="mt-2 text-secondary-600">
              Discover collaboration opportunities and paid tasks
            </p>
          </div>
          <Link
            to="/app/feed/create"
            className="btn-primary flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Post
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-secondary-400" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  className="pl-10 input-field"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>
            <div>
              <select
                className="input-field"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="Free Collaboration">Free Collaboration</option>
                <option value="Paid Task">Paid Task</option>
              </select>
            </div>
            <div>
              <select
                className="input-field"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
              >
                <option value="">All Tags</option>
                <option value="javascript">JavaScript</option>
                <option value="react">React</option>
                <option value="python">Python</option>
                <option value="design">Design</option>
                <option value="writing">Writing</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSearch}
              className="btn-secondary flex items-center"
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Posts Grid - Improved Responsive Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-6 w-full">
        {posts.map((post) => {
          // Skip posts with null authors (deleted users)
          if (!post.author) {
            return null;
          }
          
          return (
            <div
              key={post._id}
              className="bg-white rounded-lg shadow-sm border border-gray-100 hover:shadow-lg hover:border-blue-200 hover:scale-[1.02] transition-all duration-200 overflow-hidden group cursor-pointer w-full max-w-sm mx-auto md:max-w-none md:mx-0 relative"
            >
              {/* Header - Minimal */}
              <div className="p-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1 relative z-[50]" onClick={(e) => e.stopPropagation()}>
                      <img
                        src={getProfileImageUrl(post.author?.profilePicture) || '/default-avatar.png'}
                        alt={post.author?.name || 'Unknown User'}
                        className="h-8 w-8 rounded-full flex-shrink-0 cursor-pointer"
                        onClick={() => window.location.href = `/app/profile/${post.author!._id}`}
                      />
                      <span
                        onClick={(e) => { e.stopPropagation(); window.location.href = `/app/profile/${post.author!._id}`; }}
                        className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors truncate cursor-pointer"
                      >
                        {post.author!.name}
                      </span>
                    </div>
                  {/* Presence indicators are hidden in feed to reduce noise */}
                </div>
                
                {/* Badges and Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  {/* Post Type Badge */}
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
                  
                  {/* Reward Amount */}
                  {post.reward && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">
                      🪙 {post.reward} CP
                    </span>
                  )}
                  
                  
                  {/* Edit/Delete for post creator - Prevent event bubbling */}
                  {user && post.author._id === user._id && (
                    <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/app/feed/edit/${post._id}`}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit post"
                      >
                        <PencilIcon className="h-3 w-3" />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(post._id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete post"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content - Essential Only - Make entire card clickable */}
            <Link to={`/app/feed/${post._id}`}>
            <div className="px-4 pb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 break-words group-hover:text-blue-800 transition-colors">
                {post.title}
              </h3>
              
              {/* Description with subtle fade */}
              <div className="relative overflow-hidden">
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-2 break-words break-all">
                  {post.description}
                </p>
                <div className="absolute bottom-0 right-0 bg-gradient-to-l from-white via-white to-transparent pl-6">
                  <span className="text-blue-800 text-sm font-medium">
                    ...
                  </span>
                </div>
              </div>

              {/* Key tags only */}
              <div className="flex flex-wrap gap-1 mt-3">
                {post.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-sm"
                  >
                    #{tag}
                  </span>
                ))}
                {post.tags.length > 2 && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-sm">
                    +{post.tags.length - 2}
                  </span>
                )}
              </div>
            </div>
          </Link>
          
          {/* Save Button - Outside Link to prevent conflicts */}
          {user && post.author._id !== user._id && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave(post._id);
              }}
              className={`absolute top-4 right-4 p-2 rounded-full shadow-sm z-10 transition-all duration-200 ${
                savedPosts.has(post._id)
                  ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                  : 'text-gray-400 bg-white/80 hover:text-blue-600 hover:bg-white'
              }`}
              title={savedPosts.has(post._id) ? 'Remove from saved' : 'Save post'}
            >
              <svg 
                className="h-4 w-4" 
                fill={savedPosts.has(post._id) ? 'currentColor' : 'none'} 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
        </div>
        );
        })}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <ChatBubbleLeftRightIcon className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            No posts found
          </h3>
          <p className="text-secondary-500 mb-6">
            Try adjusting your search criteria or create the first post!
          </p>
          <Link to="/app/feed/create" className="btn-primary">
            Create First Post
          </Link>
        </div>
      )}

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
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
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
    </div>
  );
};

export default CollabFeed;
