import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';

export type NotificationType = 
  | 'message' 
  | 'connection_request' 
  | 'connection_accepted' 
  | 'comment_added' 
  | 'reaction_added'
  | 'post_reaction_added'
  | 'reply_added'
  | 'post_created'
  | 'collaboration_request'
  | 'collaboration_request_approved'
  | 'collaboration_request_declined';

export interface Toast {
  id: string;
  type: NotificationType;
  actor: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  message: string;
  metadata?: {
    conversationId?: string;
    messageId?: string;
    postId?: string;
    commentId?: string;
    userId?: string;
    commentContent?: string;
    messageContent?: string;
    replyId?: string;
    recipientType?: string;
    postOwnerName?: string;
    replyContent?: string;
    [key: string]: any; // Allow additional metadata fields
  };
  timestamp: number;
  othersCount?: number; // For grouped notifications
  // For interactive toasts (connection requests)
  actions?: {
    accept?: () => void;
    decline?: () => void;
  };
}

interface NotificationContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  playTestSound: () => void;
  pauseToastTimer: (id: string) => void;
  resumeToastTimer: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track timeout IDs for each toast so we can pause/resume them
  const timeoutRefs = React.useRef<Map<string, { timeoutId: NodeJS.Timeout; remainingTime: number; startTime: number }>>(new Map());
  // Track message IDs that have already shown a toast to prevent duplicates
  const shownMessageIdsRef = React.useRef<Set<string>>(new Set()); // messageId -> has shown toast
  
  // Load sound preference from localStorage, default to true
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('notificationSoundEnabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const { user } = useAuth(); // Get current user to check for self-notifications
  const { preferences, isDoNotDisturbActive } = useNotificationPreferences();
  const pendingSoundRef = React.useRef<NotificationType | null>(null); // queue one pending sound until unlocked
  
  // Wrapper to persist sound preference
  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('notificationSoundEnabled', String(enabled));
    }
  }, []);
  
  // Play test sound function (forces unlock and plays notify.mp3)
  const playTestSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    // Force unlock audio
    globalAudioUnlocked = true;
    audioUnlockedRef.current = true;
    
    // Play test sound using 'post_created' type (which uses notify.mp3)
    setTimeout(() => {
      playNotificationSound('post_created');
    }, 100);
  }, []);
  
  // Track if audio has been unlocked (browser autoplay policy requires user interaction)
  const audioUnlockedRef = React.useRef<boolean>(false);
  
  // Unlock audio context on first user interaction (bypass autoplay policy)
  React.useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) {
        return; // Already unlocked
      }
      
      try {
        // Create a very short silent audio to unlock autoplay
        const unlockAudio = new Audio();
        unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        unlockAudio.volume = 0.001; // Almost inaudible
        
        const playPromise = unlockAudio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              unlockAudio.pause();
              unlockAudio.currentTime = 0;
              audioUnlockedRef.current = true;
              console.log('[Notification] 🔊 Audio unlocked - sounds will now play');
              // If a sound was queued before unlock, play it now
              if (pendingSoundRef.current) {
                const type = pendingSoundRef.current;
                pendingSoundRef.current = null;
                setTimeout(() => {
                  try {
                    playNotificationSound(type);
                  } catch {}
                }, 0);
              }
            })
            .catch(() => {
              // Will unlock on next user interaction
            });
        }
      } catch (err) {
        // Ignore - will unlock on user interaction
      }
    };

    // Try to unlock on any user interaction
    const unlockOnInteraction = () => {
      unlockAudio();
      // If we have a pending sound queued before unlock, play it now
      if (audioUnlockedRef.current && pendingSoundRef.current) {
        const type = pendingSoundRef.current;
        pendingSoundRef.current = null;
        setTimeout(() => {
          try {
            playNotificationSound(type);
          } catch {}
        }, 0);
      }
    };

    const events = ['click', 'pointerdown', 'touchstart', 'keydown', 'mousedown', 'focus'];
    events.forEach(eventType => {
      document.addEventListener(eventType, unlockOnInteraction, { once: false, passive: true });
    });

    // Also try to unlock immediately (may fail, but worth trying)
    unlockAudio();

    return () => {
      events.forEach(eventType => {
        document.removeEventListener(eventType, unlockOnInteraction);
      });
    };
  }, []);

  const showToast = useCallback((toast: Omit<Toast, 'id' | 'timestamp'>) => {
    // CRITICAL: Deduplicate message notifications by messageId
    // For message type notifications, check if we've already shown a toast for this message
    if (toast.type === 'message' && toast.metadata?.messageId) {
      const messageId = String(toast.metadata.messageId);
      if (shownMessageIdsRef.current.has(messageId)) {
        console.log('[NotificationContext] ⏭️ Skipping duplicate toast for message:', messageId);
        return; // Already shown a toast for this message
      }
      // Mark this message as having shown a toast
      shownMessageIdsRef.current.add(messageId);
      // Clean up old entries after 30 seconds to prevent memory leak
      setTimeout(() => {
        shownMessageIdsRef.current.delete(messageId);
      }, 30000);
    }
    
    const newToast: Toast = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };

    setToasts(prev => {
      const now = Date.now();
      const GROUPING_WINDOW = 5000; // 5 seconds window for grouping
      
      // Check for similar notifications to group
      const similarToastIndex = prev.findIndex(t => {
        // Must be same type
        if (t.type !== newToast.type) return false;
        
        // Must be within grouping window
        if (now - t.timestamp > GROUPING_WINDOW) return false;
        
        // Check relevant metadata based on type for grouping
        if (newToast.type === 'post_reaction_added' && t.metadata?.postId === newToast.metadata?.postId) {
          return true; // Group post upvotes
        }
        if (newToast.type === 'reaction_added' && 
            t.metadata?.commentId === newToast.metadata?.commentId &&
            (t.metadata as any)?.replyId === (newToast.metadata as any)?.replyId) {
          return true; // Group comment/reply upvotes on same item
        }
        if (newToast.type === 'reply_added' && 
            t.metadata?.commentId === newToast.metadata?.commentId &&
            (t.metadata as any)?.recipientType === (newToast.metadata as any)?.recipientType) {
          return true; // Group replies to same comment (for same recipient type)
        }
        
        return false;
      });
      
      if (similarToastIndex !== -1) {
        // Group with existing notification
        const existingToast = prev[similarToastIndex];
        const updatedToasts = [...prev];
        
        // Check if actor is already counted
        const isNewActor = existingToast.actor._id !== newToast.actor._id;
        
        if (isNewActor) {
          // Update the existing toast with incremented count
          updatedToasts[similarToastIndex] = {
            ...existingToast,
            othersCount: (existingToast.othersCount || 0) + 1,
            timestamp: now, // Update timestamp to extend grouping window
          };
          
          // Re-format message with grouping
          updatedToasts[similarToastIndex].message = formatGroupedMessage(
            existingToast.type,
            existingToast.actor.name,
            updatedToasts[similarToastIndex].othersCount || 0,
            existingToast.metadata
          );
        }
        
        return updatedToasts;
      }
      
      // No similar toast found, add as new
      return [...prev, newToast];
    });

    // Play sound if enabled and not from self
    // Check if this is a self-notification (actor is current user)
    const actorId = String(newToast.actor._id || '');
    const userId = String(user?._id || '');
    const isSelfNotification = actorId === userId;
    
    // Check if sound should play (respect preferences and Do Not Disturb)
    const shouldPlaySound = 
      soundEnabled && 
      preferences.soundEnabled && 
      !isDoNotDisturbActive() &&
      typeof window !== 'undefined' && 
      !isSelfNotification;
    
    if (shouldPlaySound) {
      // If audio isn't unlocked yet (typical right after reload before first interaction),
      // queue this sound and play it as soon as we unlock on user interaction.
      if (!audioUnlockedRef.current) {
        pendingSoundRef.current = newToast.type;
        console.log('[Notification] ⏳ Queued sound until user interaction unlocks audio');
      } else {
        // Use setTimeout to ensure it doesn't block the UI update
        setTimeout(() => {
          playNotificationSound(newToast.type);
        }, 150);
      }
    } else if (isSelfNotification) {
      console.log('[Notification] 🔇 Skipping sound - notification from self');
    } else if (!soundEnabled || !preferences.soundEnabled) {
      console.log('[Notification] 🔇 Sound disabled');
    } else if (isDoNotDisturbActive()) {
      console.log('[Notification] 🔇 Do Not Disturb active - sound muted');
    }

    // Auto-remove toast after timeout (longer for interactive toasts)
    const timeout = newToast.type === 'connection_request' ? 10000 : 5000;
    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
      timeoutRefs.current.delete(newToast.id);
    }, timeout);
    
    // Store timeout info for pause/resume functionality
    timeoutRefs.current.set(newToast.id, {
      timeoutId,
      remainingTime: timeout,
      startTime: Date.now(),
    });
  }, [soundEnabled, preferences, isDoNotDisturbActive, user]);

  const pauseToastTimer = useCallback((id: string) => {
    const timeoutInfo = timeoutRefs.current.get(id);
    if (!timeoutInfo) return;

    // Calculate remaining time
    const elapsed = Date.now() - timeoutInfo.startTime;
    const remaining = Math.max(0, timeoutInfo.remainingTime - elapsed);

    // Clear the current timeout
    clearTimeout(timeoutInfo.timeoutId);

    // Update with remaining time
    timeoutRefs.current.set(id, {
      ...timeoutInfo,
      remainingTime: remaining,
    });
  }, []);

  const resumeToastTimer = useCallback((id: string) => {
    const timeoutInfo = timeoutRefs.current.get(id);
    if (!timeoutInfo) return;

    // Create new timeout with remaining time
    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timeoutRefs.current.delete(id);
    }, timeoutInfo.remainingTime);

    // Update with new timeout and start time
    timeoutRefs.current.set(id, {
      timeoutId,
      remainingTime: timeoutInfo.remainingTime,
      startTime: Date.now(),
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    // Clear timeout if exists
    const timeoutInfo = timeoutRefs.current.get(id);
    if (timeoutInfo) {
      clearTimeout(timeoutInfo.timeoutId);
      timeoutRefs.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ toasts, showToast, removeToast, clearToasts, soundEnabled, setSoundEnabled, playTestSound, pauseToastTimer, resumeToastTimer }}>
      {children}
    </NotificationContext.Provider>
  );
};

// Helper function to format grouped notification messages
function formatGroupedMessage(
  type: NotificationType,
  firstName: string,
  othersCount: number,
  metadata: any
): string {
  const postOwnerName = metadata?.postOwnerName;
  const isReplyUpvote = metadata?.replyId;
  
  switch (type) {
    case 'post_reaction_added':
      if (othersCount === 0) {
        return `${firstName} upvoted your post`;
      }
      return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} upvoted your post`;
    
    case 'reaction_added':
      if (isReplyUpvote) {
        // Reply upvote
        if (postOwnerName && postOwnerName !== 'Unknown') {
          if (othersCount === 0) {
            return `${firstName} upvoted your reply on ${postOwnerName}'s post`;
          }
          return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} upvoted your reply on ${postOwnerName}'s post`;
        }
        if (othersCount === 0) {
          return `${firstName} upvoted your reply`;
        }
        return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} upvoted your reply`;
      } else {
        // Comment upvote
        if (postOwnerName && postOwnerName !== 'Unknown') {
          if (othersCount === 0) {
            return `${firstName} upvoted your comment on ${postOwnerName}'s post`;
          }
          return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} upvoted your comment on ${postOwnerName}'s post`;
        }
        if (othersCount === 0) {
          return `${firstName} upvoted your comment`;
        }
        return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} upvoted your comment`;
      }
    
    case 'reply_added':
      const recipientType = metadata?.recipientType;
      if (recipientType === 'post_owner') {
        // Post owner notification: "Luke replied to a comment on your post"
        // Don't include post owner name since recipient IS the post owner
        if (othersCount === 0) {
          return `${firstName} replied to a comment on your post`;
        }
        return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} replied to a comment on your post`;
      } else if (recipientType === 'reply_owner') {
        // Reply owner notification: "Luke replied to your reply on Ana's post"
        // Show post owner name for context (since reply owner is different from post owner)
        if (postOwnerName && postOwnerName !== 'Unknown') {
          if (othersCount === 0) {
            return `${firstName} replied to your reply on ${postOwnerName}'s post`;
          }
          return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} replied to your reply on ${postOwnerName}'s post`;
        }
        if (othersCount === 0) {
          return `${firstName} replied to your reply`;
        }
        return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} replied to your reply`;
      } else {
        // Comment owner notification: "Luke replied to your comment on Ana's post"
        // Show post owner name (since comment owner is different from post owner)
        if (postOwnerName && postOwnerName !== 'Unknown') {
          if (othersCount === 0) {
            return `${firstName} replied to your comment on ${postOwnerName}'s post`;
          }
          return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} replied to your comment on ${postOwnerName}'s post`;
        }
        if (othersCount === 0) {
          return `${firstName} replied to your comment`;
        }
        return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''} replied to your comment`;
      }
    
    default:
      return `${firstName} and ${othersCount} other${othersCount > 1 ? 's' : ''}`;
  }
}

// Store active audio instances to prevent overlapping sounds
let activeAudioInstance: HTMLAudioElement | null = null;

/**
 * Play notification sound based on type
 * Sounds should be stored in: client/public/sounds/
 * - message.mp3 (for messages)
 * - notify.mp3 (for all other notifications)
 * 
 * Location: client/public/sounds/message.mp3 and client/public/sounds/notify.mp3
 * These are accessible at: /sounds/message.mp3 and /sounds/notify.mp3
 */
// Global audio unlock tracker
let globalAudioUnlocked = false;

function unlockAudioOnce() {
  if (globalAudioUnlocked) return;
  
  try {
    const audio = new Audio();
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    audio.volume = 0.001;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          audio.pause();
          globalAudioUnlocked = true;
          console.log('[Notification] 🔊 Audio unlocked');
        })
        .catch(() => {
          // Will unlock on next interaction
        });
    }
  } catch (e) {
    // Ignore
  }
}

// Unlock on any user interaction (global)
if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'touchstart', 'keydown', 'mousedown', 'focus'];
  unlockEvents.forEach(eventType => {
    document.addEventListener(eventType, unlockAudioOnce, { once: false, passive: true });
  });
  // Also try immediately
  unlockAudioOnce();
}

function playNotificationSound(type: NotificationType): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  // Try to unlock if not already unlocked
  if (!globalAudioUnlocked) {
    unlockAudioOnce();
  }
  
  try {
    // Stop any currently playing sound to prevent overlapping
    if (activeAudioInstance) {
      try {
        activeAudioInstance.pause();
        activeAudioInstance.currentTime = 0;
      } catch (e) {
        // Ignore
      }
      activeAudioInstance = null;
    }

    const soundFile = type === 'message' ? '/sounds/message.mp3' : '/sounds/notify.mp3';
    console.log('[Notification] 🔊 Playing sound:', soundFile);
    
    const audio = new Audio(soundFile);
    activeAudioInstance = audio;
    audio.volume = 0.6;
    
    const cleanup = () => {
      activeAudioInstance = null;
      try {
        audio.removeEventListener('ended', cleanup);
        audio.removeEventListener('error', handleError);
      } catch (e) {
        // Ignore
      }
    };
    
    const handleError = (e: Event) => {
      console.error('[Notification] ❌ Sound error:', soundFile);
      const audioError = (audio as any).error;
      if (audioError) {
        console.error('[Notification] Error code:', audioError.code, 'Message:', audioError.message);
      }
      cleanup();
    };
    
    audio.addEventListener('ended', cleanup);
    audio.addEventListener('error', handleError);
    
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[Notification] ✅ Sound playing:', soundFile);
          globalAudioUnlocked = true;
        })
        .catch((err: any) => {
          console.warn('[Notification] ⚠️ Sound blocked:', err.name);
          if (err.name === 'NotAllowedError') {
            console.warn('[Notification] User needs to interact with page first (click anywhere)');
          }
          cleanup();
        });
    }
  } catch (error) {
    console.error('[Notification] Sound error:', error);
    activeAudioInstance = null;
  }
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
