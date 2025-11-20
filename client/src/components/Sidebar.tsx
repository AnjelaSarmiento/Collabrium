import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  TrashIcon,
  BookmarkIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { getProfileImageUrl } from '../utils/image';

const Sidebar: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return null;
  }

  const navigation = [
    { name: 'Home', href: '/app', icon: HomeIcon },
    { name: 'CollabFeed', href: '/app/feed', icon: ChatBubbleLeftRightIcon },
    { name: 'Messages', href: '/app/messages', icon: EnvelopeIcon },
    { name: 'Saved Posts', href: '/app/saved', icon: BookmarkIcon },
    { name: 'Leaderboard', href: '/app/leaderboard', icon: TrophyIcon },
    { name: 'Wallet', href: '/app/wallet', icon: CurrencyDollarIcon },
    { name: 'Bin', href: '/app/bin', icon: TrashIcon },
  ];

  const isActive = (href: string) => {
    if (href === '/app') {
      return location.pathname === '/app';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[var(--bg-card)]">
        {/* Collabrium Title */}
        <div className="flex-shrink-0 px-4 py-4 h-16 flex items-center justify-start pl-8">
          <Link to="/app" className="flex items-center">
            <h1 className="text-2xl font-bold text-primary-600 dark:text-[var(--link-color)]">Collabrium</h1>
          </Link>
        </div>
        
        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
          <nav className="flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    isActive(item.href)
                      ? 'bg-primary-100 dark:bg-[var(--bg-hover)] text-primary-900 dark:text-[var(--text-primary)]'
                      : 'text-secondary-600 dark:text-[var(--text-secondary)] hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] hover:text-secondary-900 dark:hover:text-[var(--text-primary)]'
                  } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors`}
                >
                  <Icon
                    className={`${
                      isActive(item.href) ? 'text-primary-500 dark:text-[var(--link-color)]' : 'text-secondary-400 dark:text-[var(--icon-color)] group-hover:text-secondary-500 dark:group-hover:text-[var(--icon-hover)]'
                    } mr-3 flex-shrink-0 h-6 w-6`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        
        {/* User Info */}
        <div className="flex-shrink-0 flex border-t border-secondary-200 dark:border-[var(--border-color)] p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <img
                src={getProfileImageUrl(user?.profilePicture) || '/default-avatar.png'}
                alt={user?.name}
                className="h-10 w-10 rounded-full"
              />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)]">{user?.name}</p>
              <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                Level {user?.level} • {user?.collabPoints} CP
              </p>
              {/* Presence indicator hidden in sidebar to avoid duplication */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
