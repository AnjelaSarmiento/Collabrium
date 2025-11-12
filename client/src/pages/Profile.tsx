import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  StarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  FireIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getProfileImageUrl, getRefreshedProfileImageUrl } from '../utils/image';
import UserStatusBadge from '../components/UserStatusBadge';
import { useSocket } from '../contexts/SocketContext';


interface User {
  _id: string;
  name: string;
  email: string;
  bio: string;
  skills: string[];
  profilePicture: string;
  collabPoints: number;
  level: number;
  experience: number;
  badges: Array<{
    name: string;
    description: string;
    icon: string;
    earnedAt: string;
  }>;
  availability: string;
  completedCollaborations: number;
  rating: number;
  reviews: Array<{
    reviewer: {
      _id: string;
      name: string;
      profilePicture: string;
    };
    rating: number;
    comment: string;
    createdAt: string;
  }>;
  posts: Array<{
    _id: string;
    title: string;
    type: string;
    reward?: number;
    status: string;
    createdAt: string;
    isDeleted?: boolean;
  }>;
}

const Profile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser, updateUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    bio: '',
    skills: [] as string[],
    availability: '',
  });
  const [skillInput, setSkillInput] = useState('');
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [relationship, setRelationship] = useState<'self' | 'connected' | 'incoming' | 'outgoing' | 'none'>('none');
  const [connections, setConnections] = useState<Array<{ _id: string; name: string; profilePicture: string }>>([]);
  const [incoming, setIncoming] = useState<Array<{ _id: string; name: string; profilePicture: string }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ _id: string; name: string; profilePicture: string }>>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'connections' | 'incoming' | 'outgoing'>('posts');

  // Lightweight polling to keep the active tab updated without page refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'connections') fetchConnections();
      if (activeTab === 'incoming' || activeTab === 'outgoing') fetchRequests();
      if (activeTab === 'posts') fetchUserProfile();
    }, 20000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Realtime updates via socket
  const { onSocialUpdate } = useSocket();
  const isOwnProfile = currentUser?._id === userId;
  
  useEffect(() => {
    const handler = (payload: { userIds: string[] }) => {
      if (!payload?.userIds) return;
      if (payload.userIds.includes(String(userId)) || (currentUser?._id && payload.userIds.includes(String(currentUser._id)))) {
        fetchRelationship();
        fetchConnections();
        if (isOwnProfile) fetchRequests();
      }
    };
    onSocialUpdate?.(handler);
    
    // Also listen for window events as a backup (for Accept/Decline from notifications)
    const windowHandler = () => {
      if (isOwnProfile) {
        fetchRequests();
        fetchConnections();
      }
      fetchRelationship();
    };
    window.addEventListener('social:update', windowHandler);
    
    return () => {
      window.removeEventListener('social:update', windowHandler);
    };
  }, [userId, currentUser?._id, isOwnProfile]);

  useEffect(() => {
    if (userId) {
      fetchUserProfile();
      fetchRelationship();
      fetchConnections();
      if (isOwnProfile) fetchRequests();
    }
  }, [userId]);

  const fetchRelationship = async () => {
    try {
      const res = await axios.get(`/users/relationship/${userId}`);
      if (res.data?.status) setRelationship(res.data.status);
    } catch (e) {
      // ignore
    }
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showImageModal) {
        setShowImageModal(false);
      }
    };

    if (showImageModal) {
      document.addEventListener('keydown', handleEsc);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [showImageModal]);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`/users/profile/${userId}`);
      const userData = response.data.user;
      console.log('Fetched user profile:', userData);
      console.log('Profile picture path:', userData.profilePicture);
      setUser(userData);
      setEditForm({
        name: userData.name,
        bio: userData.bio || '',
        skills: userData.skills || [],
        availability: userData.availability,
      });
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setProfilePicture(null);
    setProfilePicturePreview('');
    setSkillInput('');
    setError('');
    if (user) {
      setEditForm({
        name: user.name,
        bio: user.bio || '',
        skills: user.skills || [],
        availability: user.availability,
      });
    }
  };

  const handleAddSkill = () => {
    if (skillInput.trim() && !editForm.skills.includes(skillInput.trim().toLowerCase())) {
      setEditForm(prev => ({
        ...prev,
        skills: [...prev.skills, skillInput.trim().toLowerCase()]
      }));
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setEditForm(prev => ({
      ...prev,
      skills: prev.skills.filter(skill => skill !== skillToRemove)
    }));
  };

  const handleSkillKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfilePicture(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePicturePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setIsUploading(true);
      setError('');
      
      const skillsArray = editForm.skills;

      const formData = new FormData();
      formData.append('name', editForm.name);
      formData.append('bio', editForm.bio);
      formData.append('skills', JSON.stringify(skillsArray));
      formData.append('availability', editForm.availability);
      
      if (profilePicture) {
        formData.append('profilePicture', profilePicture);
      }

      console.log('Sending profile update:', {
        name: editForm.name,
        bio: editForm.bio,
        skills: skillsArray,
        availability: editForm.availability,
        hasProfilePicture: !!profilePicture
      });

      const response = await axios.put('/users/profile', formData);

      console.log('Profile update response:', response.data);

      if (response.data.success) {
        const updated: User = response.data.user;
        console.log('Updated user data:', updated);
      
        // Get a non-cached, refreshed URL version
        const refreshedProfilePicture = getRefreshedProfileImageUrl(updated.profilePicture);
      
        setIsEditing(false);
        setProfilePicture(null);
        setProfilePicturePreview('');
      
        // Merge new data with refreshed image
        setUser((prev) => (prev ? { ...prev, ...updated, profilePicture: refreshedProfilePicture } : { ...updated, profilePicture: refreshedProfilePicture }));
      
        // Update global user in AuthContext
        if (currentUser && updated._id === currentUser._id) {
          updateUser({
            ...currentUser,
            ...updated,
            profilePicture: refreshedProfilePicture,
          });
        }
      }
       else {
        setError(response.data.message || 'Failed to update profile');
      }
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      setError(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConnectClick = async () => {
    try {
      const res = await axios.post(`/users/connect/${userId}`);
      await fetchRelationship();
      if (res.data?.action) {
        // refresh profile minimally if connected/disconnected to reflect counts in future
        fetchUserProfile();
      }
    } catch (e) {}
  };

  const handleAccept = async () => {
    try {
      await axios.post(`/users/accept/${userId}`);
      await fetchRelationship();
      fetchUserProfile();
    } catch (e) {}
  };

  const handleDecline = async () => {
    try {
      await axios.post(`/users/decline/${userId}`);
      await fetchRelationship();
    } catch (e) {}
  };

  const fetchConnections = async () => {
    try {
      const res = await axios.get(`/users/connections/${userId}`);
      if (res.data?.connections) setConnections(res.data.connections);
    } catch {}
  };

  const fetchRequests = async () => {
    try {
      const res = await axios.get('/users/requests');
      setIncoming(res.data?.incoming || []);
      setOutgoing(res.data?.outgoing || []);
    } catch {}
  };

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case 'Online':
        return 'bg-green-100 text-green-800';
      case 'Busy':
        return 'bg-yellow-100 text-yellow-800';
      case 'Accepting Paid Tasks':
        return 'bg-blue-100 text-blue-800';
      case 'Offline':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAvailabilityDot = (availability: string) => {
    switch (availability) {
      case 'Online':
        return 'bg-green-400';
      case 'Busy':
        return 'bg-yellow-400';
      case 'Accepting Paid Tasks':
        return 'bg-blue-400';
      case 'Offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-secondary-900 mb-4">User not found</h1>
          <p className="text-secondary-600 mb-6">The user you're looking for doesn't exist.</p>
          <Link to="/feed" className="btn-primary">
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  console.log('User object:', user);
  console.log('Profile picture path:', user.profilePicture);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-8 mb-6">
        <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-6">
          <div className="flex-shrink-0">
            {isEditing ? (
              <div className="relative">
                <img
                  src={
                    profilePicturePreview ||
                    (getProfileImageUrl(user.profilePicture) || `data:image/svg+xml;base64,${btoa(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"150\" height=\"150\" viewBox=\"0 0 150 150\"><circle cx=\"75\" cy=\"75\" r=\"75\" fill=\"#6366f1\"/><text x=\"75\" y=\"85\" font-family=\"Arial\" font-size=\"60\" fill=\"white\" text-anchor=\"middle\">${user.name.charAt(0).toUpperCase()}</text></svg>`)}`)
                  }
                  alt={user.name}
                  className="h-32 w-32 rounded-full border-4 border-white shadow-lg cursor-pointer hover:opacity-80 transition-opacity"
                  onError={(e) => {
                    console.error('Profile picture preview failed to load:', profilePicturePreview || user.profilePicture);
                    e.currentTarget.src = `data:image/svg+xml;base64,${btoa(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"150\" height=\"150\" viewBox=\"0 0 150 150\"><circle cx=\"75\" cy=\"75\" r=\"75\" fill=\"#6366f1\"/><text x=\"75\" y=\"85\" font-family=\"Arial\" font-size=\"60\" fill=\"white\" text-anchor=\"middle\">${user.name.charAt(0).toUpperCase()}</text></svg>`)}`;
                  }}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="absolute bottom-0 right-0 bg-primary-600 text-white rounded-full p-2 shadow-lg">
                  <PencilIcon className="h-4 w-4" />
                </div>
              </div>
            ) : (
              <img
                src={
                  getProfileImageUrl(user.profilePicture) || `data:image/svg+xml;base64,${btoa(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"150\" height=\"150\" viewBox=\"0 0 150 150\"><circle cx=\"75\" cy=\"75\" r=\"75\" fill=\"#6366f1\"/><text x=\"75\" y=\"85\" font-family=\"Arial\" font-size=\"60\" fill=\"white\" text-anchor=\"middle\">${user.name.charAt(0).toUpperCase()}</text></svg>`)}`
                }
                alt={user.name}
                className="h-32 w-32 rounded-full border-4 border-white shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowImageModal(true)}
                onError={(e) => {
                  const constructed = getProfileImageUrl(user.profilePicture) || 'No profile picture';
                  console.error('Profile picture failed to load. URL:', constructed);
                  e.currentTarget.src = `data:image/svg+xml;base64,${btoa(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"150\" height=\"150\" viewBox=\"0 0 150 150\"><circle cx=\"75\" cy=\"75\" r=\"75\" fill=\"#6366f1\"/><text x=\"75\" y=\"85\" font-family=\"Arial\" font-size=\"60\" fill=\"white\" text-anchor=\"middle\">${user.name.charAt(0).toUpperCase()}</text></svg>`)}`;
                }}
                onLoad={() => {
                  console.log('Profile picture loaded successfully:', user.profilePicture);
                }}
              />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-secondary-900">{user.name}</h1>
                {!isOwnProfile && <UserStatusBadge userId={user._id} className="mt-2" />}
                <div className="flex items-center mt-2 space-x-4">
                  <div className="flex items-center text-sm text-secondary-600">
                    <StarIcon className="h-4 w-4 text-yellow-500 mr-1" />
                    {user.rating.toFixed(1)} ({user.reviews.length} reviews)
                  </div>
                </div>
              </div>
              
              {isOwnProfile ? (
                <div className="flex space-x-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isUploading}
                        className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckIcon className="h-4 w-4 mr-2" />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="btn-secondary flex items-center"
                      >
                        <XMarkIcon className="h-4 w-4 mr-2" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleEdit}
                      className="btn-secondary flex items-center"
                    >
                      <PencilIcon className="h-4 w-4 mr-2" />
                      Edit Profile
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex space-x-2">
                  {relationship === 'connected' && (
                    <button onClick={handleConnectClick} className="btn-secondary">Connected • Remove</button>
                  )}
                  {relationship === 'none' && (
                    <button onClick={handleConnectClick} className="btn-primary">Connect</button>
                  )}
                  {relationship === 'outgoing' && (
                    <button onClick={handleConnectClick} className="btn-secondary">Request Sent • Cancel</button>
                  )}
                  {relationship === 'incoming' && (
                    <>
                      <button onClick={handleAccept} className="btn-primary">Accept</button>
                      <button onClick={handleDecline} className="btn-secondary">Decline</button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-sm text-red-600">{error}</div>
              </div>
            )}

            {/* Bio */}
            <div className="mt-4">
              {isEditing ? (
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  className="w-full input-field"
                  rows={3}
                  placeholder="Tell us about yourself..."
                />
              ) : (
                <p className="text-secondary-700">
                  {user.bio || 'No bio available'}
                </p>
              )}
            </div>

            {/* Skills */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-secondary-900 mb-2">Skills</h3>
              {isEditing ? (
                <div>
                  <div className="flex space-x-2 mb-3">
                    <input
                      type="text"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyPress={handleSkillKeyPress}
                      className="flex-1 input-field"
                      placeholder="Add a skill..."
                    />
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      className="btn-secondary"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editForm.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="ml-2 text-primary-600 hover:text-primary-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-secondary-500">
                    Add skills one by one to showcase your expertise.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {user.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
          <div className="flex items-center">
            <CurrencyDollarIcon className="h-8 w-8 text-primary-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500">CollabPoints</p>
              <p className="text-2xl font-semibold text-secondary-900">{user.collabPoints}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
          <div className="flex items-center">
            <FireIcon className="h-8 w-8 text-orange-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500">Level</p>
              <p className="text-2xl font-semibold text-secondary-900">{user.level}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
          <div className="flex items-center">
            <UserGroupIcon className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500">Collaborations</p>
              <p className="text-2xl font-semibold text-secondary-900">{user.completedCollaborations}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
          <div className="flex items-center">
            <StarIcon className="h-8 w-8 text-yellow-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-500">Rating</p>
              <p className="text-2xl font-semibold text-secondary-900">{user.rating.toFixed(1)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column: Badges (left) + Tabs (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left: Badges */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
            <h3 className="text-lg font-medium text-secondary-900 mb-4">Badges</h3>
            <div className="space-y-3">
              {user.badges.map((badge, index) => (
                <div key={index} className="flex items-center p-3 bg-secondary-50 rounded-lg">
                  <span className="text-2xl mr-3">{badge.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-secondary-900">{badge.name}</p>
                    <p className="text-xs text-secondary-600">{badge.description}</p>
                  </div>
                </div>
              ))}
              {user.badges.length === 0 && (
                <p className="text-secondary-500 text-sm">No badges earned yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200">
            <div className="flex items-center border-b border-secondary-200 px-4 pt-4">
              {[
                { key: 'posts', label: 'Recent Posts' },
                { key: 'connections', label: 'Connections' },
                ...(isOwnProfile ? [{ key: 'incoming', label: 'Pending Requests' }, { key: 'outgoing', label: 'Sent Requests' }] as any : [])
              ].map((t: any) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`relative mr-2 mb-0.5 px-3 py-2 text-sm ${activeTab === t.key ? 'text-secondary-900' : 'text-secondary-600 hover:text-secondary-900'}`}
                >
                  {t.label}
                  {activeTab === t.key && (
                    <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-primary-600" />
                  )}
                </button>
              ))}
            </div>
            <div className="p-6">
              {activeTab === 'posts' && (
                <div className="space-y-4">
                  {user.posts.filter(p => !p.isDeleted).slice(0, 5).map((post) => (
                    <div key={post._id} className="border border-secondary-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-secondary-900">{post.title}</h4>
                          <div className="flex items-center mt-1 space-x-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              post.type === 'Paid Task' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {post.type}
                            </span>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              post.status === 'Completed' ? 'bg-green-100 text-green-800' :
                              post.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {post.status}
                            </span>
                            {post.reward && (
                              <span className="text-xs text-green-600 font-medium">
                                {post.reward} CP
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          to={`/app/feed/${post._id}?from=profile&userId=${userId}`}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                  {user.posts.length === 0 && (
                    <p className="text-secondary-500 text-sm">No posts yet</p>
                  )}
                </div>
              )}

              {activeTab === 'connections' && (
                <div>
                  {connections.length === 0 ? (
                    <p className="text-secondary-500 text-sm">No connections yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {connections.map((c) => (
                        <div key={c._id} className="flex items-center gap-3 p-3 border border-secondary-200 rounded-lg">
                          <img src={getProfileImageUrl(c.profilePicture) || '/default-avatar.png'} alt={c.name} className="h-8 w-8 rounded-full" />
                          <a href={`/app/profile/${c._id}`} className="text-sm text-secondary-900 hover:underline break-words">{c.name}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isOwnProfile && activeTab === 'incoming' && (
                <div>
                  {incoming.length === 0 ? (
                    <p className="text-secondary-500 text-sm">No pending requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {incoming.map((u) => (
                        <div key={u._id} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center gap-2">
                            <img src={getProfileImageUrl(u.profilePicture) || '/default-avatar.png'} alt={u.name} className="h-6 w-6 rounded-full" />
                            <a href={`/app/profile/${u._id}`} className="text-sm text-secondary-900 hover:underline break-words">{u.name}</a>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => { await axios.post(`/users/accept/${u._id}`); await fetchRequests(); await fetchConnections(); }} className="px-2 py-1 text-xs rounded bg-primary-600 text-white">Accept</button>
                            <button onClick={async () => { await axios.post(`/users/decline/${u._id}`); await fetchRequests(); }} className="px-2 py-1 text-xs rounded border">Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isOwnProfile && activeTab === 'outgoing' && (
                <div>
                  {outgoing.length === 0 ? (
                    <p className="text-secondary-500 text-sm">No sent requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {outgoing.map((u) => (
                        <div key={u._id} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center gap-2">
                            <img src={getProfileImageUrl(u.profilePicture) || '/default-avatar.png'} alt={u.name} className="h-6 w-6 rounded-full" />
                            <a href={`/app/profile/${u._id}`} className="text-sm text-secondary-900 hover:underline break-words">{u.name}</a>
                          </div>
                          <div>
                            <button onClick={async () => { await axios.post(`/users/connect/${u._id}`); await fetchRequests(); }} className="px-2 py-1 text-xs rounded border">Cancel</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reviews */}
      {user.reviews.length > 0 && (
        <div className="mt-6">
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
            <h3 className="text-lg font-medium text-secondary-900 mb-4">Reviews</h3>
            <div className="space-y-4">
              {user.reviews.map((review, index) => (
                <div key={index} className="border-b border-secondary-200 pb-4 last:border-b-0">
                  <div className="flex items-start space-x-3">
                    <img
                      src={getProfileImageUrl(review.reviewer.profilePicture) || '/default-avatar.png'}
                      alt={review.reviewer.name}
                      className="h-8 w-8 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-secondary-900">{review.reviewer.name}</p>
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <StarIcon
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating ? 'text-yellow-500' : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-secondary-500">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-secondary-700 mt-1">{review.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profile Picture Preview Modal */}
      {showImageModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setShowImageModal(false)}
        >
          {/* Close Button - positioned at top-right corner of backdrop */}
          <button
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 md:top-6 md:right-6 text-white hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-white hover:bg-opacity-10 z-20"
            aria-label="Close preview"
          >
            <XMarkIcon className="h-6 w-6 md:h-8 md:w-8" />
          </button>
          
          <div 
            className="relative max-w-4xl max-h-[90vh] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image Container */}
            <div className="relative bg-transparent rounded-lg overflow-hidden shadow-2xl">
              
              <img
                src={
                  getProfileImageUrl(user.profilePicture) || `data:image/svg+xml;base64,${btoa(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"600\" viewBox=\"0 0 600 600\"><circle cx=\"300\" cy=\"300\" r=\"300\" fill=\"#6366f1\"/><text x=\"300\" y=\"340\" font-family=\"Arial\" font-size=\"240\" fill=\"white\" text-anchor=\"middle\">${user.name.charAt(0).toUpperCase()}</text></svg>`)}`
                }
                alt={user.name}
                className="w-full h-auto max-h-[90vh] object-contain"
                onError={(e) => {
                  const constructed = getProfileImageUrl(user.profilePicture) || 'No profile picture';
                  console.error('Profile picture failed to load in modal. URL:', constructed);
                  e.currentTarget.src = `data:image/svg+xml;base64,${btoa(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"600\" viewBox=\"0 0 600 600\"><circle cx=\"300\" cy=\"300\" r=\"300\" fill=\"#6366f1\"/><text x=\"300\" y=\"340\" font-family=\"Arial\" font-size=\"240\" fill=\"white\" text-anchor=\"middle\">${user.name.charAt(0).toUpperCase()}</text></svg>`)}`;
                }}
              />
              
              {/* User Name Overlay (on mobile) */}
              <div className="md:hidden bg-gradient-to-t from-black via-black/50 to-transparent absolute bottom-0 left-0 right-0 p-4">
                <p className="text-white font-semibold text-lg">{user.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
