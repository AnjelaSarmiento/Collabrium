import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ChatBubbleLeftRightIcon,
  VideoCameraIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  UserGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const Home: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  const features = [
    {
      name: 'Real-time Collaboration',
      description: 'Work together in real-time with chat, file sharing, and whiteboard tools.',
      icon: ChatBubbleLeftRightIcon,
    },
    {
      name: 'Video Calls',
      description: 'Connect face-to-face with built-in video conferencing like Google Meet.',
      icon: VideoCameraIcon,
    },
    {
      name: 'CollabPoints Rewards',
      description: 'Earn points for helping others and spend them on getting help.',
      icon: CurrencyDollarIcon,
    },
    {
      name: 'Gamification',
      description: 'Level up, earn badges, and compete on leaderboards.',
      icon: TrophyIcon,
    },
    {
      name: 'Community Feed',
      description: 'Discover collaboration opportunities and paid tasks.',
      icon: UserGroupIcon,
    },
    {
      name: 'AI Assistant',
      description: 'Get smart suggestions and recommendations for better collaboration.',
      icon: SparklesIcon,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-secondary-900 dark:text-[var(--text-primary)] sm:text-5xl md:text-6xl">
          Welcome to{' '}
          <span className="text-primary-600 dark:text-[var(--link-color)]">Collabrium</span>
        </h1>
        <p className="mt-3 max-w-md mx-auto text-base text-secondary-500 dark:text-[var(--text-secondary)] sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
          The next-generation platform that combines learning, freelancing, and community collaboration.
          Help others, solve problems, and work together in real-time while earning rewards.
        </p>
        <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
          {isAuthenticated ? (
            <div className="space-y-3 sm:space-y-0 sm:space-x-3 sm:flex">
              <Link
                to="/app/feed"
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 md:py-4 md:text-lg md:px-10"
              >
                Explore CollabFeed
              </Link>
              <Link
                to="/app/wallet"
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary-700 dark:text-[var(--link-color)] bg-primary-100 dark:bg-[var(--bg-card)] hover:bg-primary-200 dark:hover:bg-[var(--bg-hover)] md:py-4 md:text-lg md:px-10"
              >
                View Wallet
              </Link>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-0 sm:space-x-3 sm:flex">
              <Link
                to="/register"
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 md:py-4 md:text-lg md:px-10"
              >
                Get Started
              </Link>
              <Link
                to="/login"
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary-700 dark:text-[var(--link-color)] bg-primary-100 dark:bg-[var(--bg-card)] hover:bg-primary-200 dark:hover:bg-[var(--bg-hover)] md:py-4 md:text-lg md:px-10"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* User Stats (if authenticated) */}
      {isAuthenticated && user && (
        <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)] p-6 mb-8">
          <h2 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Your Stats</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-primary-50 dark:bg-[var(--bg-hover)] rounded-lg p-4">
              <div className="flex items-center">
                <CurrencyDollarIcon className="h-8 w-8 text-primary-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">CollabPoints</p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">{user.collabPoints}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 dark:bg-[var(--bg-hover)] rounded-lg p-4">
              <div className="flex items-center">
                <TrophyIcon className="h-8 w-8 text-green-600 dark:text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">Level</p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">{user.level}</p>
                </div>
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-[var(--bg-hover)] rounded-lg p-4">
              <div className="flex items-center">
                <UserGroupIcon className="h-8 w-8 text-blue-600 dark:text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">Collaborations</p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">{user.completedCollaborations || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-yellow-50 dark:bg-[var(--bg-hover)] rounded-lg p-4">
              <div className="flex items-center">
                <SparklesIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-secondary-500 dark:text-[var(--text-secondary)]">Skills</p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-[var(--text-primary)]">{user.skills?.length || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Features Section */}
      <div className="py-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-secondary-900 dark:text-[var(--text-primary)]">
              Everything you need for collaboration
            </h2>
            <p className="mt-4 max-w-2xl text-xl text-secondary-500 dark:text-[var(--text-secondary)] mx-auto">
              Collabrium provides all the tools you need to collaborate effectively and earn rewards.
            </p>
          </div>

          <div className="mt-12">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.name} className="card">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Icon className="h-8 w-8 text-primary-600" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)]">
                          {feature.name}
                        </h3>
                        <p className="mt-2 text-base text-secondary-500 dark:text-[var(--text-secondary)]">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      {!isAuthenticated && (
        <div className="bg-primary-600 rounded-lg shadow-sm p-8 text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to start collaborating?
          </h2>
          <p className="mt-4 text-xl text-primary-100">
            Join thousands of users who are already earning rewards while helping others.
          </p>
          <div className="mt-8">
            <Link
              to="/register"
              className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary-600 dark:text-[var(--link-color)] bg-white dark:bg-[var(--bg-card)] hover:bg-primary-50 dark:hover:bg-[var(--bg-hover)] md:py-4 md:text-lg md:px-10"
            >
              Create Your Account
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
