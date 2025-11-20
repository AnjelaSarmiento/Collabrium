import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  TrophyIcon,
  StarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  FireIcon,
} from '@heroicons/react/24/outline';
import UserHoverCard from '../components/UserHoverCard';
import { getProfileImageUrl } from '../utils/image';

interface LeaderboardUser {
  rank: number;
  _id: string;
  name: string;
  profilePicture: string;
  collabPoints: number;
  level: number;
  completedCollaborations: number;
  rating: number;
  badges: Array<{
    name: string;
    icon: string;
  }>;
}

const Leaderboard: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'points' | 'collaborations' | 'rating' | 'level'>('points');

  useEffect(() => {
    fetchLeaderboard();
  }, [sortBy]);

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`/users/leaderboard?type=${sortBy}&limit=50`);
      setLeaderboard(response.data.leaderboard);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <TrophyIcon className="h-6 w-6 text-yellow-500" />;
      case 2:
        return <TrophyIcon className="h-6 w-6 text-gray-400" />;
      case 3:
        return <TrophyIcon className="h-6 w-6 text-orange-600" />;
      default:
        return <span className="text-lg font-bold text-secondary-600 dark:text-[var(--text-secondary)]">#{rank}</span>;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-500';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-600';
      default:
        return 'bg-white dark:bg-[var(--bg-card)]';
    }
  };

  const getSortLabel = (type: string) => {
    switch (type) {
      case 'points':
        return 'CollabPoints';
      case 'collaborations':
        return 'Collaborations';
      case 'rating':
        return 'Rating';
      case 'level':
        return 'Level';
      default:
        return 'CollabPoints';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary-900 dark:text-[var(--text-primary)]">Leaderboard</h1>
        <p className="text-secondary-600 dark:text-[var(--text-secondary)] mt-2">See who's leading the collaboration game</p>
      </div>

      {/* Sort Options */}
      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6 mb-6">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'points', label: 'CollabPoints', icon: CurrencyDollarIcon },
            { id: 'collaborations', label: 'Collaborations', icon: UserGroupIcon },
            { id: 'rating', label: 'Rating', icon: StarIcon },
            { id: 'level', label: 'Level', icon: FireIcon },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => setSortBy(option.id as any)}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  sortBy === option.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-secondary-100 dark:bg-[var(--bg-hover)] text-secondary-700 dark:text-[var(--text-primary)] hover:bg-secondary-200 dark:hover:bg-[var(--bg-panel)]'
                }`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top 3 Podium */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* 2nd Place */}
          {leaderboard[1] && (
            <div className="order-2 md:order-1">
              <div 
                className="block bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6 text-center hover:shadow-md transition-shadow"
              >
                <div className="flex justify-center mb-4">
                  <TrophyIcon className="h-12 w-12 text-gray-400 dark:text-[var(--icon-color)]" />
                </div>
                <div className="flex justify-center mb-4">
                  <UserHoverCard userId={leaderboard[1]._id}>
                    <img
                      src={getProfileImageUrl(leaderboard[1].profilePicture) || '/default-avatar.png'}
                      alt={leaderboard[1].name}
                      className="h-16 w-16 rounded-full border-4 border-gray-300 dark:border-[var(--border-color)] cursor-pointer"
                      onClick={() => window.location.href = `/app/profile/${leaderboard[1]._id}`}
                    />
                  </UserHoverCard>
                </div>
                <UserHoverCard userId={leaderboard[1]._id}>
                  <h3 
                    className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)] mb-2 hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/app/profile/${leaderboard[1]._id}`}
                  >
                    {leaderboard[1].name}
                  </h3>
                </UserHoverCard>
                <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)] mb-2">Level {leaderboard[1].level}</p>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">
                    {leaderboard[1].collabPoints} CollabPoints
                  </p>
                  <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
                    {leaderboard[1].completedCollaborations} Collaborations
                  </p>
                  <div className="flex items-center justify-center">
                    <StarIcon className="h-4 w-4 text-yellow-500 mr-1" />
                    <span className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
                      {leaderboard[1].rating.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 1st Place */}
          <div className="order-1 md:order-2">
            <div 
              className="block bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6 text-center hover:shadow-md transition-shadow"
            >
              <div className="flex justify-center mb-4">
                <TrophyIcon className="h-16 w-16 text-yellow-500" />
              </div>
              <div className="flex justify-center mb-4">
                <UserHoverCard userId={leaderboard[0]._id}>
                  <img
                    src={getProfileImageUrl(leaderboard[0].profilePicture) || '/default-avatar.png'}
                    alt={leaderboard[0].name}
                    className="h-20 w-20 rounded-full border-4 border-yellow-400 cursor-pointer"
                    onClick={() => window.location.href = `/app/profile/${leaderboard[0]._id}`}
                  />
                </UserHoverCard>
              </div>
              <UserHoverCard userId={leaderboard[0]._id}>
                <h3 
                  className="text-xl font-bold text-secondary-900 dark:text-[var(--text-primary)] mb-2 hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/app/profile/${leaderboard[0]._id}`}
                >
                  {leaderboard[0].name}
                </h3>
              </UserHoverCard>
              <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)] mb-2">Level {leaderboard[0].level}</p>
              <div className="space-y-1">
                <p className="text-lg font-bold text-secondary-900 dark:text-[var(--text-primary)]">
                  {leaderboard[0].collabPoints} CollabPoints
                </p>
                <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
                  {leaderboard[0].completedCollaborations} Collaborations
                </p>
                <div className="flex items-center justify-center">
                  <StarIcon className="h-4 w-4 text-yellow-500 mr-1" />
                  <span className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
                    {leaderboard[0].rating.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex justify-center space-x-1">
                {leaderboard[0].badges.slice(0, 3).map((badge, index) => (
                  <span key={index} className="text-lg" title={badge.name}>
                    {badge.icon}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 3rd Place */}
          {leaderboard[2] && (
            <div className="order-3">
              <div 
                className="block bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6 text-center hover:shadow-md transition-shadow"
              >
                <div className="flex justify-center mb-4">
                  <TrophyIcon className="h-12 w-12 text-orange-600" />
                </div>
                <div className="flex justify-center mb-4">
                  <UserHoverCard userId={leaderboard[2]._id}>
                    <img
                      src={getProfileImageUrl(leaderboard[2].profilePicture) || '/default-avatar.png'}
                      alt={leaderboard[2].name}
                      className="h-16 w-16 rounded-full border-4 border-orange-300 cursor-pointer"
                      onClick={() => window.location.href = `/app/profile/${leaderboard[2]._id}`}
                    />
                  </UserHoverCard>
                </div>
                <UserHoverCard userId={leaderboard[2]._id}>
                  <h3 
                    className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)] mb-2 hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/app/profile/${leaderboard[2]._id}`}
                  >
                    {leaderboard[2].name}
                  </h3>
                </UserHoverCard>
                <p className="text-sm text-secondary-600 mb-2">Level {leaderboard[2].level}</p>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)]">
                    {leaderboard[2].collabPoints} CollabPoints
                  </p>
                  <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
                    {leaderboard[2].completedCollaborations} Collaborations
                  </p>
                  <div className="flex items-center justify-center">
                    <StarIcon className="h-4 w-4 text-yellow-500 mr-1" />
                    <span className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">
                      {leaderboard[2].rating.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Leaderboard */}
      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)]">
        <div className="p-6 border-b border-secondary-200 dark:border-[var(--border-color)]">
          <h2 className="text-xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">
            {getSortLabel(sortBy)} Leaderboard
          </h2>
        </div>
        <div className="divide-y divide-secondary-200 dark:divide-[var(--border-color)]">
          {leaderboard.map((user, index) => (
            <div
              key={user._id}
              className={`p-6 hover:bg-secondary-50 dark:hover:bg-[var(--bg-hover)] transition-colors ${
                index < 3 ? getRankColor(user.rank) : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-8">
                    {getRankIcon(user.rank)}
                  </div>
                  <UserHoverCard userId={user._id}>
                    <img
                      src={getProfileImageUrl(user.profilePicture) || '/default-avatar.png'}
                      alt={user.name}
                      className="h-12 w-12 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                      onClick={() => window.location.href = `/app/profile/${user._id}`}
                    />
                  </UserHoverCard>
                  <div>
                    <UserHoverCard userId={user._id}>
                      <span
                        className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] hover:text-primary-600 dark:hover:text-[var(--link-color)] transition-colors cursor-pointer"
                        onClick={() => window.location.href = `/app/profile/${user._id}`}
                      >
                        {user.name}
                      </span>
                    </UserHoverCard>
                    <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)]">Level {user.level}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <p className="text-sm text-secondary-500 dark:text-[var(--text-secondary)]">CollabPoints</p>
                    <p className="text-lg font-semibold text-secondary-900 dark:text-[var(--text-primary)]">
                      {user.collabPoints}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-secondary-500">Collaborations</p>
                    <p className="text-lg font-semibold text-secondary-900">
                      {user.completedCollaborations}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-secondary-500">Rating</p>
                    <div className="flex items-center">
                      <StarIcon className="h-4 w-4 text-yellow-500 mr-1" />
                      <span className="text-lg font-semibold text-secondary-900">
                        {user.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    {user.badges.slice(0, 5).map((badge, badgeIndex) => (
                      <span
                        key={badgeIndex}
                        className="text-lg"
                        title={badge.name}
                      >
                        {badge.icon}
                      </span>
                    ))}
                    {user.badges.length > 5 && (
                      <span className="text-sm text-secondary-500 dark:text-[var(--text-secondary)]">
                        +{user.badges.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {leaderboard.length === 0 && (
        <div className="text-center py-12">
          <TrophyIcon className="h-16 w-16 text-secondary-400 dark:text-[var(--icon-color)] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-2">
            No leaderboard data available
          </h3>
          <p className="text-secondary-600 dark:text-[var(--text-secondary)]">
            Start collaborating to see yourself on the leaderboard!
          </p>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
