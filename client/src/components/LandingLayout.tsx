import React from 'react';
import { Outlet } from 'react-router-dom';

const LandingLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Landing page header - simple navigation */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary-600">Collabrium</h1>
            </div>
            <nav className="flex items-center space-x-4">
              <a
                href="/login"
                className="text-secondary-600 hover:text-secondary-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Login
              </a>
              <a
                href="/register"
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Sign Up
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content area - full width, no sidebar */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Simple footer */}
      <footer className="bg-secondary-900 text-white">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-secondary-300">
              © 2024 Collabrium. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingLayout;
