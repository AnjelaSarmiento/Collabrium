import { useState, useEffect, useCallback } from 'react';

// Custom event for preference changes (for real-time updates across components)
const PREFERENCE_CHANGE_EVENT = 'notificationPreferencesChanged';

export interface NotificationPreferences {
  // Sound settings
  soundEnabled: boolean;
  
  // Email notifications
  emailNotifications: boolean;
  
  // In-app alerts
  inAppAlerts: boolean;
  
  // Notification types (user-facing labels mapped to backend types)
  notificationTypes: {
    connectionRequest: boolean;      // "John sent you a connection request"
    connectionAccepted: boolean;     // "Mary accepted your connection request"
    newPost: boolean;                // "Sarah shared a new post" or "John mentioned you in a post"
    commentAdded: boolean;           // "Mike commented on your post"
    postUpvote: boolean;             // "Anna upvoted your post"
    commentReplyUpvote: boolean;     // "Anna upvoted your comment/reply"
    replyAdded: boolean;             // "Luke replied to your comment"
    message: boolean;                // "New message"
  };
  
  // Do Not Disturb
  doNotDisturb: {
    enabled: boolean;
    startTime: string;  // HH:mm format
    endTime: string;    // HH:mm format
  };
  
  // Notification preview
  showPreview: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  emailNotifications: true,
  inAppAlerts: true,
  notificationTypes: {
    connectionRequest: true,
    connectionAccepted: true,
    newPost: true,
    commentAdded: true,
    postUpvote: true,
    commentReplyUpvote: true,
    replyAdded: true,
    message: true,
  },
  doNotDisturb: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
  },
  showPreview: true,
};

const STORAGE_KEY = 'notificationPreferences';

export const useNotificationPreferences = () => {
  const [preferences, setPreferencesState] = useState<NotificationPreferences>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Merge with defaults to ensure all fields exist
          return {
            ...DEFAULT_PREFERENCES,
            ...parsed,
            notificationTypes: {
              ...DEFAULT_PREFERENCES.notificationTypes,
              ...parsed.notificationTypes,
            },
            doNotDisturb: {
              ...DEFAULT_PREFERENCES.doNotDisturb,
              ...parsed.doNotDisturb,
            },
          };
        } catch (e) {
          console.error('Failed to parse notification preferences:', e);
        }
      }
    }
    return DEFAULT_PREFERENCES;
  });

  const setPreferences = useCallback((newPreferences: Partial<NotificationPreferences>) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, ...newPreferences };
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent(PREFERENCE_CHANGE_EVENT, { detail: updated }));
      }
      return updated;
    });
  }, []);

  const updateNotificationType = useCallback((type: keyof NotificationPreferences['notificationTypes'], enabled: boolean) => {
    setPreferencesState((prev) => {
      const updated = {
        ...prev,
        notificationTypes: {
          ...prev.notificationTypes,
          [type]: enabled,
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent(PREFERENCE_CHANGE_EVENT, { detail: updated }));
      }
      return updated;
    });
  }, []);

  // Listen for preference changes from other components
  useEffect(() => {
    const handlePreferenceChange = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationPreferences>;
      if (customEvent.detail) {
        setPreferencesState((prev) => ({
          ...DEFAULT_PREFERENCES,
          ...customEvent.detail,
          notificationTypes: {
            ...DEFAULT_PREFERENCES.notificationTypes,
            ...customEvent.detail.notificationTypes,
          },
          doNotDisturb: {
            ...DEFAULT_PREFERENCES.doNotDisturb,
            ...customEvent.detail.doNotDisturb,
          },
        }));
      }
    };

    // Listen for custom events (same tab)
    window.addEventListener(PREFERENCE_CHANGE_EVENT, handlePreferenceChange);
    
    // Listen for storage events (other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setPreferencesState((prev) => ({
            ...DEFAULT_PREFERENCES,
            ...parsed,
            notificationTypes: {
              ...DEFAULT_PREFERENCES.notificationTypes,
              ...parsed.notificationTypes,
            },
            doNotDisturb: {
              ...DEFAULT_PREFERENCES.doNotDisturb,
              ...parsed.doNotDisturb,
            },
          }));
        } catch (e) {
          console.error('Failed to parse notification preferences from storage event:', e);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(PREFERENCE_CHANGE_EVENT, handlePreferenceChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const isDoNotDisturbActive = useCallback((): boolean => {
    if (!preferences.doNotDisturb.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

    const [startHour, startMinute] = preferences.doNotDisturb.startTime.split(':').map(Number);
    const [endHour, endMinute] = preferences.doNotDisturb.endTime.split(':').map(Number);

    let startMinutes = startHour * 60 + startMinute;
    let endMinutes = endHour * 60 + endMinute;

    // Handle overnight DND (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      // Overnight: DND is active if current time is >= start OR <= end
      return currentTime >= startMinutes || currentTime <= endMinutes;
    } else {
      // Same day: DND is active if current time is between start and end
      return currentTime >= startMinutes && currentTime <= endMinutes;
    }
  }, [preferences.doNotDisturb]);

  return {
    preferences,
    setPreferences,
    updateNotificationType,
    isDoNotDisturbActive,
  };
};

