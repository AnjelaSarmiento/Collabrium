import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessagesWidgetContainer from './MessagesWidgetContainer';

const Layout: React.FC = () => {
  const location = useLocation();
  // Hide sidebar in full-page room view
  const isFullPageRoom = location.pathname.startsWith('/app/room/');

  return (
    <div className="min-h-screen bg-secondary-50">
      <Navbar />
      <div className="flex">
        {!isFullPageRoom && <Sidebar />}
        <main className={`flex-1 ${!isFullPageRoom ? 'md:ml-64' : ''} ${isFullPageRoom ? '' : 'p-6'}`}>
          <Outlet />
        </main>
      </div>
      <MessagesWidgetContainer />
    </div>
  );
};

export default Layout;
