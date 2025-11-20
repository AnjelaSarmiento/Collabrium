import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import axios from 'axios';
import {
  UserCircleIcon,
  CurrencyDollarIcon,
  BellIcon,
  CheckIcon,
  EnvelopeIcon,
  SpeakerWaveIcon,
  MoonIcon,
  EyeIcon,
  EyeSlashIcon,
  SunIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '../contexts/ThemeContext';

type SettingsTab = 'profile' | 'wallet' | 'notifications' | 'appearance';

const Settings: React.FC = () => {
  const { user } = useAuth();
  const { soundEnabled, setSoundEnabled, playTestSound } = useNotification();
  const { preferences, setPreferences, updateNotificationType, isDoNotDisturbActive } = useNotificationPreferences();
  const { theme, effectiveTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [walletSettings, setWalletSettings] = useState({
    autoAcceptPayments: true,
    minimumWithdrawal: 50,
    currency: 'CollabPoints',
  });
  const [loading, setLoading] = useState(false);
  const [walletSettingsLoading, setWalletSettingsLoading] = useState(true);

  useEffect(() => {
    fetchWalletSettings();
  }, []);

  const fetchWalletSettings = async () => {
    try {
      const response = await axios.get('/wallet');
      if (response.data.wallet?.settings) {
        setWalletSettings({
          autoAcceptPayments: response.data.wallet.settings.autoAcceptPayments ?? true,
          minimumWithdrawal: response.data.wallet.settings.minimumWithdrawal ?? 50,
          currency: response.data.wallet.settings.currency ?? 'CollabPoints',
        });
      }
    } catch (error) {
      console.error('Failed to fetch wallet settings:', error);
    } finally {
      setWalletSettingsLoading(false);
    }
  };

  const handleWalletSettingsSave = async () => {
    setLoading(true);
    try {
      await axios.put('/wallet/settings', walletSettings);
      alert('Wallet settings saved successfully!');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save wallet settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setPreferences({ soundEnabled: enabled });
    if (enabled) {
      // Play test sound when enabling
      setTimeout(() => {
        playTestSound();
      }, 200);
    }
  };

  // Sync notification preferences with NotificationContext
  useEffect(() => {
    setSoundEnabled(preferences.soundEnabled);
  }, [preferences.soundEnabled, setSoundEnabled]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-secondary-900 dark:text-[var(--text-primary)]">Settings</h1>
        <p className="text-secondary-600 dark:text-[var(--text-secondary)] mt-2">Manage your account preferences and settings</p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-[var(--bg-card)] rounded-lg shadow-sm border border-secondary-200 dark:border-[var(--border-color)]">
        <div className="border-b border-secondary-200 dark:border-[var(--border-color)]">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'profile', name: 'Profile Settings', icon: UserCircleIcon },
              { id: 'wallet', name: 'Wallet Settings', icon: CurrencyDollarIcon },
              { id: 'notifications', name: 'Notification Settings', icon: BellIcon },
              { id: 'appearance', name: 'Appearance', icon: SunIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-primary-500 dark:border-[var(--link-color)] text-primary-600 dark:text-[var(--link-color)]'
                      : 'border-transparent text-secondary-500 dark:text-[var(--text-secondary)] hover:text-secondary-700 dark:hover:text-[var(--text-primary)] hover:border-secondary-300 dark:hover:border-[var(--border-hover)]'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* Profile Settings Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Profile Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-secondary)] mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={user?.name || ''}
                      disabled
                      className="input-field bg-secondary-50"
                    />
                    <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                      Edit your profile from your profile page
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-secondary)] mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="input-field bg-secondary-50"
                    />
                  </div>
                  <button
                    onClick={() => navigate(`/app/profile/${user?._id}`)}
                    className="btn-primary"
                  >
                    Edit Profile
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Wallet Settings Tab */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Wallet Preferences</h3>
                {walletSettingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-1">
                          Auto Accept Payments
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                          Automatically accept incoming payments
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setWalletSettings({
                            ...walletSettings,
                            autoAcceptPayments: !walletSettings.autoAcceptPayments,
                          })
                        }
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          walletSettings.autoAcceptPayments ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            walletSettings.autoAcceptPayments ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                        Minimum Withdrawal (CollabPoints)
                      </label>
                      <input
                        type="number"
                        min="10"
                        value={walletSettings.minimumWithdrawal}
                        onChange={(e) =>
                          setWalletSettings({
                            ...walletSettings,
                            minimumWithdrawal: parseInt(e.target.value) || 10,
                          })
                        }
                        className="input-field"
                      />
                      <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                        Minimum amount required to withdraw CollabPoints
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                        Currency Display
                      </label>
                      <select
                        value={walletSettings.currency}
                        onChange={(e) =>
                          setWalletSettings({
                            ...walletSettings,
                            currency: e.target.value,
                          })
                        }
                        className="input-field"
                      >
                        <option value="CollabPoints">CollabPoints</option>
                        <option value="USD">USD</option>
                        <option value="PHP">PHP</option>
                      </select>
                    </div>

                    <button
                      onClick={handleWalletSettingsSave}
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? 'Saving...' : 'Save Wallet Settings'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notification Settings Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              {/* General Notification Settings */}
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Notification Preferences</h3>
                <div className="space-y-4">
                  {/* Enable Notification Sounds */}
                  <div className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <SpeakerWaveIcon className="h-6 w-6 text-primary-600 dark:text-[var(--link-color)]" />
                      </div>
                      <div className="ml-4">
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)]">
                          Enable Notification Sounds
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                          Play sounds for new messages and notifications
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSoundToggle(!preferences.soundEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        preferences.soundEnabled ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          preferences.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Email Notifications */}
                  <div className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <EnvelopeIcon className="h-6 w-6 text-primary-600 dark:text-[var(--link-color)]" />
                      </div>
                      <div className="ml-4">
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)]">
                          Email Notifications
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                          Receive email when someone comments on your post or sends you a connection request
                        </p>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-medium">
                          ⚠️ Requires backend email service integration
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPreferences({ emailNotifications: !preferences.emailNotifications })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        preferences.emailNotifications ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          preferences.emailNotifications ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* In-App Notification Alerts */}
                  <div className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <BellIcon className="h-6 w-6 text-primary-600 dark:text-[var(--link-color)]" />
                      </div>
                      <div className="ml-4">
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)]">
                          In-App Notification Alerts
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                          Enable/disable in-app banners or toast pop-ups for new events
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPreferences({ inAppAlerts: !preferences.inAppAlerts })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        preferences.inAppAlerts ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          preferences.inAppAlerts ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Notification Preview */}
                  <div className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        {preferences.showPreview ? (
                          <EyeIcon className="h-6 w-6 text-primary-600 dark:text-[var(--link-color)]" />
                        ) : (
                          <EyeSlashIcon className="h-6 w-6 text-secondary-400 dark:text-[var(--icon-color)]" />
                        )}
                      </div>
                      <div className="ml-4">
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)]">
                          Notification Preview
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                          Show/hide preview text (e.g., message snippet or comment preview) inside notification pop-ups
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPreferences({ showPreview: !preferences.showPreview })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        preferences.showPreview ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          preferences.showPreview ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Notification Types */}
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Notification Types</h3>
                <p className="text-sm text-secondary-600 dark:text-[var(--text-secondary)] mb-4">
                  Choose which events trigger alerts. Use the toggles below to enable or disable specific notification types.
                </p>
                <div className="space-y-3">
                  {[
                    {
                      key: 'connectionRequest' as const,
                      label: 'Connection Request',
                      description: 'Someone sends you a connection request.',
                    },
                    {
                      key: 'connectionAccepted' as const,
                      label: 'Connection Accepted',
                      description: 'Your connection request is accepted.',
                    },
                    {
                      key: 'newPost' as const,
                      label: 'New Post',
                      description: 'A connection or mention creates a new post.',
                    },
                    {
                      key: 'commentAdded' as const,
                      label: 'Comment Added',
                      description: 'Someone comments on your post.',
                    },
                    {
                      key: 'postUpvote' as const,
                      label: 'Post Upvoted',
                      description: 'Someone upvotes your post.',
                    },
                    {
                      key: 'commentReplyUpvote' as const,
                      label: 'Comment/Reply Upvoted',
                      description: 'Someone upvotes your comment or reply.',
                    },
                    {
                      key: 'replyAdded' as const,
                      label: 'Reply Added',
                      description: 'Someone replies to your comment or reply.',
                    },
                    {
                      key: 'message' as const,
                      label: 'New Message',
                      description: 'You receive a new message.',
                    },
                  ].map((type) => (
                    <div
                      key={type.key}
                      className="flex items-start justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg"
                    >
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-1">
                          {type.label}
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">{type.description}</p>
                      </div>
                      <button
                        onClick={() => updateNotificationType(type.key, !preferences.notificationTypes[type.key])}
                        className={`relative ml-4 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          preferences.notificationTypes[type.key] ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            preferences.notificationTypes[type.key] ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Do Not Disturb Mode */}
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Do Not Disturb Mode</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <MoonIcon className="h-6 w-6 text-primary-600 dark:text-[var(--link-color)]" />
                      </div>
                      <div className="ml-4">
                        <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)]">
                          Do Not Disturb
                        </label>
                        <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                          Set quiet hours when no notifications or sounds should play
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setPreferences({
                          doNotDisturb: {
                            ...preferences.doNotDisturb,
                            enabled: !preferences.doNotDisturb.enabled,
                          },
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        preferences.doNotDisturb.enabled ? 'bg-primary-600' : 'bg-secondary-300 dark:bg-[var(--border-color)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          preferences.doNotDisturb.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {preferences.doNotDisturb.enabled && (
                    <div className="ml-10 space-y-4 p-4 bg-secondary-50 dark:bg-[var(--bg-hover)] border border-secondary-200 dark:border-[var(--border-color)] rounded-lg">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={preferences.doNotDisturb.startTime}
                            onChange={(e) =>
                              setPreferences({
                                doNotDisturb: {
                                  ...preferences.doNotDisturb,
                                  startTime: e.target.value,
                                },
                              })
                            }
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-primary)] mb-2">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={preferences.doNotDisturb.endTime}
                            onChange={(e) =>
                              setPreferences({
                                doNotDisturb: {
                                  ...preferences.doNotDisturb,
                                  endTime: e.target.value,
                                },
                              })
                            }
                            className="input-field"
                          />
                        </div>
                      </div>
                      {isDoNotDisturbActive() && (
                        <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200">
                            <strong>Active:</strong> Do Not Disturb is currently enabled. Notifications are muted.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Info Messages */}
              {preferences.soundEnabled && (
                <div className="bg-secondary-50 dark:bg-[var(--bg-hover)] border border-secondary-200 dark:border-[var(--border-color)] rounded-lg p-4">
                  <p className="text-sm text-secondary-700 dark:text-[var(--text-primary)]">
                    <strong>Note:</strong> Notification sounds will play automatically for new events once enabled.
                    A test sound was played when you enabled this option.
                  </p>
                </div>
              )}

              {!preferences.soundEnabled && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Disabled:</strong> Notification sounds are currently turned off. 
                    No sounds will play for new notifications.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Appearance Settings Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-secondary-900 dark:text-[var(--text-primary)] mb-4">Theme Preferences</h3>
                <div className="space-y-4">
                  {/* Theme Selection */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-secondary-700 dark:text-[var(--text-secondary)] mb-3">
                      Choose Theme
                    </label>
                    
                    {/* Light Mode Option */}
                    <button
                      onClick={() => setTheme('light')}
                      className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                        theme === 'light'
                          ? 'border-primary-500 dark:border-[var(--link-color)] bg-primary-50 dark:bg-[var(--bg-hover)]'
                          : 'border-secondary-200 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] hover:border-secondary-300 dark:hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center">
                        <SunIcon className={`h-6 w-6 mr-3 ${
                          theme === 'light' ? 'text-primary-600' : 'text-secondary-500 dark:text-[var(--text-secondary)]'
                        }`} />
                        <div className="text-left">
                          <div className={`text-sm font-medium ${
                            theme === 'light' ? 'text-primary-900 dark:text-[var(--text-primary)]' : 'text-secondary-900 dark:text-[var(--text-primary)]'
                          }`}>
                            Light Mode
                          </div>
                          <div className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-0.5">
                            Bright, clean interface
                          </div>
                        </div>
                      </div>
                      {theme === 'light' && (
                        <CheckIcon className="h-5 w-5 text-primary-600 dark:text-[var(--link-color)]" />
                      )}
                    </button>

                    {/* Dark Mode Option */}
                    <button
                      onClick={() => setTheme('dark')}
                      className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                        theme === 'dark'
                          ? 'border-primary-500 dark:border-[var(--link-color)] bg-primary-50 dark:bg-[var(--bg-hover)]'
                          : 'border-secondary-200 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] hover:border-secondary-300 dark:hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center">
                        <MoonIcon className={`h-6 w-6 mr-3 ${
                          theme === 'dark' ? 'text-primary-600' : 'text-secondary-500 dark:text-[var(--text-secondary)]'
                        }`} />
                        <div className="text-left">
                          <div className={`text-sm font-medium ${
                            theme === 'dark' ? 'text-primary-900 dark:text-[var(--text-primary)]' : 'text-secondary-900 dark:text-[var(--text-primary)]'
                          }`}>
                            Dark Mode
                          </div>
                          <div className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-0.5">
                            Easy on the eyes, especially at night
                          </div>
                        </div>
                      </div>
                      {theme === 'dark' && (
                        <CheckIcon className="h-5 w-5 text-primary-600 dark:text-[var(--link-color)]" />
                      )}
                    </button>

                    {/* System Default Option */}
                    <button
                      onClick={() => setTheme('system')}
                      className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                        theme === 'system'
                          ? 'border-primary-500 dark:border-[var(--link-color)] bg-primary-50 dark:bg-[var(--bg-hover)]'
                          : 'border-secondary-200 dark:border-[var(--border-color)] bg-white dark:bg-[var(--bg-card)] hover:border-secondary-300 dark:hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center">
                        <ComputerDesktopIcon className={`h-6 w-6 mr-3 ${
                          theme === 'system' ? 'text-primary-600' : 'text-secondary-500 dark:text-[var(--text-secondary)]'
                        }`} />
                        <div className="text-left">
                          <div className={`text-sm font-medium ${
                            theme === 'system' ? 'text-primary-900 dark:text-[var(--text-primary)]' : 'text-secondary-900 dark:text-[var(--text-primary)]'
                          }`}>
                            System Default
                          </div>
                          <div className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-0.5">
                            Follows your device's theme ({effectiveTheme === 'dark' ? 'Dark' : 'Light'})
                          </div>
                        </div>
                      </div>
                      {theme === 'system' && (
                        <CheckIcon className="h-5 w-5 text-primary-600 dark:text-[var(--link-color)]" />
                      )}
                    </button>
                  </div>

                  {/* Current Theme Info */}
                  <div className="bg-secondary-50 dark:bg-[var(--bg-hover)] border border-secondary-200 dark:border-[var(--border-color)] rounded-lg p-4">
                    <p className="text-sm text-secondary-700 dark:text-[var(--text-secondary)]">
                      <strong>Current Theme:</strong>{' '}
                      {theme === 'system' 
                        ? `System Default (${effectiveTheme === 'dark' ? 'Dark' : 'Light'})`
                        : theme === 'dark' 
                          ? 'Dark Mode' 
                          : 'Light Mode'
                      }
                    </p>
                    <p className="text-xs text-secondary-500 dark:text-[var(--text-secondary)] mt-1">
                      Changes apply immediately across all pages and components.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;

