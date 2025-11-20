import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getProfileImageUrl } from '../utils/image';
import { usePresence } from '../contexts/PresenceContext';
import { useAuth } from '../contexts/AuthContext';

interface UserHoverCardProps {
  userId: string;
  children: ReactNode;
}

interface UserData {
  _id: string;
  name: string;
  profilePicture: string;
  level: number;
  rating: number;
  completedCollaborations: number;
  availability: string;
  skills?: string[];
  collabPoints?: number;
}

const UserHoverCard: React.FC<UserHoverCardProps> = ({ userId, children }) => {
  const [showCard, setShowCard] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [rel, setRel] = useState<'self' | 'connected' | 'incoming' | 'outgoing' | 'none'>('none');
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  
  const navigate = useNavigate();
  const { getUserStatus, formatLastSeen } = usePresence();
  const { user: currentUser } = useAuth();
  const { status, lastSeen } = getUserStatus(userId);
  
  // Hide status indicator if viewing own profile
  const isOwnProfile = currentUser?._id === userId;

  // Fetch user data when card is about to show
  const fetchUserData = async () => {
    if (isLoading || userData) return;
    
    setIsLoading(true);
    setHasError(false);
    
    try {
      const response = await axios.get(`/users/profile/${userId}`);
      setUserData(response.data.user);
      const relRes = await axios.get(`/users/relationship/${userId}`);
      if (relRes.data?.status) setRel(relRes.data.status);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMouseEnter = () => {
    // Clear any existing hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // Set delay before showing card
    timeoutRef.current = setTimeout(() => {
      fetchUserData();
      setShowCard(true);
    }, 350); // 350ms delay
  };

  const handleMouseLeave = () => {
    // Clear show timeout if not yet triggered
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set delay before hiding card (hover buffer)
    hideTimeoutRef.current = setTimeout(() => {
      setShowCard(false);
    }, 400); // 400ms hover buffer for smoother transition
  };

  // Calculate card position and pointer alignment
  useEffect(() => {
    if (showCard && triggerRef.current && cardRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const cardRect = cardRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      // Determine if card should appear above or below
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      
      const newPosition = spaceBelow < cardRect.height && spaceAbove > spaceBelow ? 'top' : 'bottom';
      
      console.log('UserHoverCard positioning:', {
        triggerRect,
        cardRect,
        spaceBelow,
        spaceAbove,
        position: newPosition,
        viewportHeight
      });
      
      setPosition(newPosition);
    }
  }, [showCard]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleViewProfile = () => {
    navigate(`/app/profile/${userId}`);
    setShowCard(false);
  };

  const handleConnect = async () => {
    try {
      await axios.post(`/users/connect/${userId}`);
      const relRes = await axios.get(`/users/relationship/${userId}`);
      if (relRes.data?.status) setRel(relRes.data.status);
    } catch {}
  };

  const getAvailabilityDot = (availability: string) => {
    switch (availability) {
      case 'Online': return 'bg-green-400';
      case 'Busy': return 'bg-yellow-400';
      case 'Accepting Paid Tasks': return 'bg-blue-400';
      case 'Offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    if (status === 'online') {
      return 'Online';
    } else if (status === 'away') {
      return 'Away';
    } else if (lastSeen) {
      return `Last online ${formatLastSeen(lastSeen)}`;
    } else {
      return 'Offline';
    }
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative inline-block"
    >
      {children}
      
      {/* Invisible bridge for smooth hover transition */}
      {showCard && (
        <div
          className="fixed bg-transparent pointer-events-auto z-[99]"
          style={{
            [position === 'bottom' ? 'top' : 'bottom']: position === 'bottom' 
              ? `${(triggerRef.current?.getBoundingClientRect().bottom || 0) + 8}px`
              : `${window.innerHeight - (triggerRef.current?.getBoundingClientRect().top || 0) + 8}px`,
            left: `${((triggerRef.current?.getBoundingClientRect().left || 0) + (triggerRef.current?.getBoundingClientRect().width || 0) / 2) - 144}px`,
            height: '16px',
            width: '288px',
          }}
          onMouseEnter={() => {
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
          }}
          onMouseLeave={handleMouseLeave}
        />
      )}
      
      {/* Hover Card */}
      {showCard && (
        <div
          ref={cardRef}
          onMouseEnter={() => {
            // Clear hide timeout when entering card
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
          }}
          onMouseLeave={handleMouseLeave}
          className={`fixed bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-xl border border-gray-200 dark:border-[var(--border-color)] p-4 w-72 z-[100] ${
            showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          } transition-all duration-200 pointer-events-auto`}
          style={{
            [position === 'bottom' ? 'top' : 'bottom']: position === 'bottom' 
              ? `${(triggerRef.current?.getBoundingClientRect().bottom || 0) + 24}px`
              : `${window.innerHeight - (triggerRef.current?.getBoundingClientRect().top || 0) + 24}px`,
            left: `${((triggerRef.current?.getBoundingClientRect().left || 0) + (triggerRef.current?.getBoundingClientRect().width || 0) / 2) - 144}px`,
          }}
        >
          {/* Arrow pointer */}
          <div
            className={`absolute w-4 h-4 bg-white dark:bg-[var(--bg-card)] border-l border-t border-gray-200 dark:border-[var(--border-color)] transform rotate-45 ${
              position === 'bottom' ? '-top-2' : '-bottom-2'
            } left-1/2 -translate-x-1/2`}
          />
          
          {isLoading && !hasError && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          )}
          
          {hasError && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 dark:text-[var(--text-secondary)]">Failed to load user data</p>
            </div>
          )}
          
          {userData && !isLoading && (
            <>
              {/* Profile Header */}
              <div className="flex items-start space-x-3 mb-3">
                <img
                  src={getProfileImageUrl(userData.profilePicture) || '/default-avatar.png'}
                  alt={userData.name}
                  className="h-16 w-16 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-[var(--text-primary)] truncate">{userData.name}</h3>
                  {/* Status directly under name (for other users only) */}
                  {!isOwnProfile && (
                    <div className="flex items-center mt-0.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor()}`} />
                      <span className="ml-1 text-xs text-gray-600 dark:text-[var(--text-secondary)]">{getStatusText()}</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-600 dark:text-[var(--text-secondary)]">Level {userData.level}</span>
                    <span className="text-gray-400 dark:text-[var(--text-muted)]">•</span>
                    <div className="flex items-center">
                      <span className="text-xs text-yellow-600 dark:text-yellow-400 mr-1">⭐</span>
                      <span className="text-xs text-gray-600 dark:text-[var(--text-secondary)]">{userData.rating.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Stats */}
              <div className="flex items-center space-x-4 py-3 border-t border-gray-200 dark:border-[var(--border-color)]">
                <div className="flex-1 text-center">
                  <div className="text-sm font-semibold text-gray-900 dark:text-[var(--text-primary)]">{userData.completedCollaborations}</div>
                  <div className="text-xs text-gray-500 dark:text-[var(--text-secondary)]">Collaborations</div>
                </div>
                <div className="w-px h-8 bg-gray-200 dark:bg-[var(--border-color)]" />
                <div className="flex-1 text-center">
                  <div className="text-sm font-semibold text-gray-900 dark:text-[var(--text-primary)]">{userData.collabPoints || 0}</div>
                  <div className="text-xs text-gray-500 dark:text-[var(--text-secondary)]">Points</div>
                </div>
              </div>
              
              {/* Skills */}
              {userData.skills && userData.skills.length > 0 && (
                <div className="py-3 border-t border-gray-200 dark:border-[var(--border-color)]">
                  <div className="flex flex-wrap gap-1.5">
                    {userData.skills.slice(0, 3).map((skill, index) => (
                      <span
                        key={index}
                        className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-[var(--bg-hover)] text-gray-700 dark:text-[var(--text-primary)] rounded"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* View Profile / Actions */}
              <div className="pt-3 border-t border-gray-200 dark:border-[var(--border-color)]">
                <div className="flex gap-2">
                  <Link
                    to={`/app/profile/${userId}`}
                    onClick={handleViewProfile}
                    className="flex-1 text-center px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors duration-200"
                  >
                    View
                  </Link>
                  {!isOwnProfile && (
                    <button
                      onClick={handleConnect}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[var(--border-color)] text-secondary-700 dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)]"
                    >
                      {rel === 'connected' ? 'Connected' : rel === 'outgoing' ? 'Request Sent' : rel === 'incoming' ? 'Accept' : 'Connect'}
                    </button>
                  )}
                  {!isOwnProfile && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await axios.post(`/messages/dm/${userId}`);
                          if (res.data?.success) {
                            const id = res.data.conversation._id;
                            window.location.href = `/app/messages?open=${id}`;
                          }
                        } catch (e) {
                          console.error('Failed to open DM', e);
                        }
                      }}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[var(--border-color)] text-secondary-700 dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-hover)]"
                    >
                      Message
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default UserHoverCard;

// TypeScript module declaration
export {};
