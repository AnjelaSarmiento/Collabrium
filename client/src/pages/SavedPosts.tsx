import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeftIcon, BookmarkIcon } from '@heroicons/react/24/outline';
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

const SavedPosts: React.FC = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      fetchSavedPosts();
    }
  }, [user]);

  const fetchSavedPosts = async () => {
    try {
      setLoading(true);
      setError(''); // Clear any previous errors
      console.log('Fetching saved posts for user:', user);
      console.log('Auth token:', localStorage.getItem('token'));
      
      // Test authentication first
      const authResponse = await axios.get('/auth/me');
      console.log('Auth test successful:', authResponse.data);
      
      const response = await axios.get('/posts/saved');
      console.log('Saved posts response:', response.data);
      setPosts(response.data.posts);
    } catch (error: any) {
      console.error('Failed to fetch saved posts:', error);
      console.error('Error response:', error.response);
      console.error('Error status:', error.response?.status);
      console.error('Error data:', error.response?.data);
      
      if (error.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (error.response?.status === 404) {
        setError('API endpoint not found. Please check server configuration.');
      } else {
        setError(`Failed to load saved posts: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = async (postId: string) => {
    try {
      await axios.post(`/posts/${postId}/save`);
      // Remove from local state
      setPosts(prev => prev.filter(post => post._id !== postId));
      alert('Post removed from saved!');
    } catch (error: any) {
      console.error('Failed to unsave post:', error);
      alert('Failed to remove post from saved');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-secondary-600">Loading saved posts...</p>
          </div>
        </div>
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
        <div>
          <h1 className="text-3xl font-bold text-secondary-900 flex items-center">
            <BookmarkIcon className="h-8 w-8 mr-3 text-blue-500" />
            Saved Posts
          </h1>
          <p className="mt-2 text-secondary-600">
            Posts you've saved for later. Click to view details or unsave.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Posts Grid */}
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
              <Link
                to={`/app/feed/${post._id}`}
                className="block hover:bg-blue-50/30 transition-colors duration-200"
              >
                {/* Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <img
                        src={getProfileImageUrl(post.author?.profilePicture) || '/default-avatar.png'}
                        alt={post.author?.name || 'Unknown User'}
                        className="h-8 w-8 rounded-full flex-shrink-0"
                      />
                      <span className="text-sm font-medium text-gray-700 group-hover:text-blue-800 transition-colors truncate">
                        {post.author?.name || 'Unknown User'}
                      </span>
                    </div>
                  
                  {/* Badges */}
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
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="px-4 pb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-800 transition-colors">
                  {post.title}
                </h3>
                
                {/* Description with subtle fade */}
                <div className="relative">
                  <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">
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
            
            {/* Unsave Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleUnsave(post._id);
              }}
              className="absolute top-4 right-4 p-2 rounded-full shadow-sm z-10 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all duration-200"
              title="Remove from saved"
            >
              <svg 
                className="h-4 w-4" 
                fill="currentColor" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>
          );
        })}
      </div>

      {posts.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <BookmarkIcon className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            No saved posts yet
          </h3>
          <p className="text-secondary-500 mb-6">
            Save posts you're interested in to view them here later.
          </p>
          <Link to="/app/feed" className="btn-primary">
            Browse Posts
          </Link>
        </div>
      )}
    </div>
  );
};

export default SavedPosts;
