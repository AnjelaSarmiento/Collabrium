import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  UsersIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  posts: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  rooms: {
    total: number;
    active: number;
    completed: number;
  };
  wallet: {
    totalPoints: number;
    totalEarned: number;
    totalSpent: number;
    averageBalance: number;
  };
}

interface User {
  _id: string;
  name: string;
  email: string;
  collabPoints: number;
  level: number;
  completedCollaborations: number;
  rating: number;
  isActive: boolean;
  createdAt: string;
}

interface Post {
  _id: string;
  title: string;
  type: string;
  reward?: number;
  status: string;
  author: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'posts' | 'transactions'>('overview');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, usersResponse, postsResponse] = await Promise.all([
        axios.get('/admin/dashboard'),
        axios.get('/admin/users?limit=20'),
        axios.get('/admin/posts?limit=20'),
      ]);

      setStats(statsResponse.data.stats);
      setUsers(usersResponse.data.users);
      setPosts(postsResponse.data.posts);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      await axios.put(`/admin/users/${userId}/status`, { isActive: !isActive });
      setUsers(users.map(user => 
        user._id === userId ? { ...user, isActive: !isActive } : user
      ));
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  const deletePost = async (postId: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    try {
      await axios.delete(`/admin/posts/${postId}`);
      setPosts(posts.filter(post => post._id !== postId));
    } catch (error) {
      console.error('Failed to delete post:', error);
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary-900">Admin Dashboard</h1>
        <p className="text-secondary-600 mt-2">Manage and monitor the Collabrium platform</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
            <div className="flex items-center">
              <UsersIcon className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-secondary-500">Total Users</p>
                <p className="text-2xl font-semibold text-secondary-900">{stats.users.total}</p>
                <p className="text-xs text-green-600">{stats.users.active} active</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
            <div className="flex items-center">
              <DocumentTextIcon className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-secondary-500">Total Posts</p>
                <p className="text-2xl font-semibold text-secondary-900">{stats.posts.total}</p>
                <p className="text-xs text-blue-600">{stats.posts.active} active</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
            <div className="flex items-center">
              <ChatBubbleLeftRightIcon className="h-8 w-8 text-purple-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-secondary-500">Total Rooms</p>
                <p className="text-2xl font-semibold text-secondary-900">{stats.rooms.total}</p>
                <p className="text-xs text-purple-600">{stats.rooms.active} active</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 p-6">
            <div className="flex items-center">
              <CurrencyDollarIcon className="h-8 w-8 text-yellow-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-secondary-500">Total CollabPoints</p>
                <p className="text-2xl font-semibold text-secondary-900">{stats.wallet.totalPoints.toLocaleString()}</p>
                <p className="text-xs text-yellow-600">Avg: {stats.wallet.averageBalance.toFixed(0)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-secondary-200">
        <div className="border-b border-secondary-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: ChartBarIcon },
              { id: 'users', name: 'Users', icon: UsersIcon },
              { id: 'posts', name: 'Posts', icon: DocumentTextIcon },
              { id: 'transactions', name: 'Transactions', icon: CurrencyDollarIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-secondary-900 mb-4">Platform Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-secondary-50 rounded-lg p-4">
                    <h4 className="font-medium text-secondary-900 mb-2">User Statistics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Users:</span>
                        <span className="font-medium">{stats?.users.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Users:</span>
                        <span className="font-medium text-green-600">{stats?.users.active}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Inactive Users:</span>
                        <span className="font-medium text-red-600">{stats?.users.inactive}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary-50 rounded-lg p-4">
                    <h4 className="font-medium text-secondary-900 mb-2">Post Statistics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Posts:</span>
                        <span className="font-medium">{stats?.posts.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Posts:</span>
                        <span className="font-medium text-blue-600">{stats?.posts.active}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completed:</span>
                        <span className="font-medium text-green-600">{stats?.posts.completed}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary-50 rounded-lg p-4">
                    <h4 className="font-medium text-secondary-900 mb-2">Room Statistics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Rooms:</span>
                        <span className="font-medium">{stats?.rooms.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active Rooms:</span>
                        <span className="font-medium text-purple-600">{stats?.rooms.active}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Completed:</span>
                        <span className="font-medium text-green-600">{stats?.rooms.completed}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary-50 rounded-lg p-4">
                    <h4 className="font-medium text-secondary-900 mb-2">Wallet Statistics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Points:</span>
                        <span className="font-medium">{stats?.wallet.totalPoints.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Earned:</span>
                        <span className="font-medium text-green-600">{stats?.wallet.totalEarned.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Spent:</span>
                        <span className="font-medium text-red-600">{stats?.wallet.totalSpent.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div>
              <h3 className="text-lg font-medium text-secondary-900 mb-4">User Management</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-secondary-200">
                  <thead className="bg-secondary-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                        Stats
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-secondary-200">
                    {users.map((user) => (
                      <tr key={user._id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-secondary-900">{user.name}</div>
                            <div className="text-sm text-secondary-500">{user.email}</div>
                            <div className="text-xs text-secondary-400">
                              Joined: {formatDate(user.createdAt)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-secondary-900">
                            <div>{user.collabPoints} CP</div>
                            <div>Level {user.level}</div>
                            <div>{user.completedCollaborations} collabs</div>
                            <div>⭐ {user.rating.toFixed(1)}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => toggleUserStatus(user._id, user.isActive)}
                            className={`${
                              user.isActive 
                                ? 'text-red-600 hover:text-red-900' 
                                : 'text-green-600 hover:text-green-900'
                            }`}
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Posts Tab */}
          {activeTab === 'posts' && (
            <div>
              <h3 className="text-lg font-medium text-secondary-900 mb-4">Post Management</h3>
              <div className="space-y-4">
                {posts.map((post) => (
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
                        <div className="mt-2 text-xs text-secondary-500">
                          <div>Author: {post.author.name} ({post.author.email})</div>
                          <div>Created: {formatDate(post.createdAt)}</div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => deletePost(post._id)}
                          className="text-red-600 hover:text-red-900 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div>
              <h3 className="text-lg font-medium text-secondary-900 mb-4">Transaction Monitoring</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <ExclamationTriangleIcon className="h-5 w-5 text-blue-600 mr-2" />
                  <p className="text-sm text-blue-800">
                    Transaction monitoring feature coming soon. This will show all platform transactions with filtering and search capabilities.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
