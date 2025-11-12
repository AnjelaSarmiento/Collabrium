import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ChatBubbleLeftRightIcon,
  VideoCameraIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  UserGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users to the app
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/app');
    }
  }, [isAuthenticated, navigate]);

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
      <div className="text-center py-12 px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-secondary-900 sm:text-5xl md:text-6xl">
          Welcome to{' '}
          <span className="text-primary-600">Collabrium</span>
        </h1>
        <p className="mt-3 max-w-md mx-auto text-base text-secondary-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
          The next-generation platform that combines learning, freelancing, and community collaboration.
          Help others, solve problems, and work together in real-time while earning rewards.
        </p>
        <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
          <div className="space-y-3 sm:space-y-0 sm:space-x-3 sm:flex">
            <Link
              to="/register"
              className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 md:py-4 md:text-lg md:px-10"
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 md:py-4 md:text-lg md:px-10"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-secondary-900">
              Everything you need for collaboration
            </h2>
            <p className="mt-4 max-w-2xl text-xl text-secondary-500 mx-auto">
              Collabrium provides all the tools you need to collaborate effectively and earn rewards.
            </p>
          </div>

          <div className="mt-12">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.name} className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Icon className="h-8 w-8 text-primary-600" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-secondary-900">
                          {feature.name}
                        </h3>
                        <p className="mt-2 text-base text-secondary-500">
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
      <div className="bg-primary-600 rounded-lg shadow-sm p-8 text-center mx-4 sm:mx-6 lg:mx-8 mb-12">
        <h2 className="text-3xl font-bold text-white">
          Ready to start collaborating?
        </h2>
        <p className="mt-4 text-xl text-primary-100">
          Join thousands of users who are already earning rewards while helping others.
        </p>
        <div className="mt-8">
          <Link
            to="/register"
            className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary-600 bg-white hover:bg-primary-50 md:py-4 md:text-lg md:px-10"
          >
            Create Your Account
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Landing;
