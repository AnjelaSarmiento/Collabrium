import { useRef, useCallback } from 'react';

/**
 * Chat sound files should be placed in: client/public/sounds/
 * 
 * Recommended file names:
 * - message_sent.mp3 - Plays when sender sends a message (while both users are in conversation)
 * - message_received.mp3 - Plays when recipient receives a message (while viewing conversation)
 * - typing.mp3 - Plays when other participant is typing (optional)
 * - message_read.mp3 - Plays when recipient reads sender's message (optional)
 * 
 * These files are accessible at:
 * - /sounds/message_sent.mp3
 * - /sounds/message_received.mp3
 * - /sounds/typing.mp3
 * - /sounds/message_read.mp3
 */

interface ChatSoundOptions {
  enabled?: boolean;
  volume?: number;
}

interface PlaySoundMetadata {
  serverTimestamp?: string;
  clientReceiveTimestamp?: string;
  uiUpdateTimestamp?: string;
  messageId?: string;
  conversationId?: string;
  [key: string]: any;
}

interface PlaySoundResult {
  success: boolean;
  playCallTimestamp: string;
  playResolvedTimestamp?: string;
  playFailedTimestamp?: string;
  latency?: number;
  error?: any;
}

// Track active audio instances to prevent overlapping sounds
const activeAudioInstances = new Map<string, HTMLAudioElement>();

// Preload audio files for better performance and immediate playback
// This ensures sounds are ready when needed, reducing latency
const preloadedAudio = new Map<string, HTMLAudioElement>();

// Preload all chat sounds on module load
if (typeof window !== 'undefined') {
  const soundFiles: Record<string, string> = {
    sent: '/sounds/message_sent.mp3',
    received: '/sounds/message_received.mp3',
    typing: '/sounds/typing.mp3',
    read: '/sounds/message_read.mp3',
  };

  Object.entries(soundFiles).forEach(([soundType, soundFile]) => {
    try {
      const audio = new Audio(soundFile);
      audio.preload = 'auto'; // Preload the audio file
      // Prime the audio by loading it
      audio.load();
      // Store reference to keep it in memory
      preloadedAudio.set(soundType, audio);
      console.log(`[ChatSounds] ✅ Preloaded and primed ${soundType} sound: ${soundFile}`);
    } catch (error) {
      console.warn(`[ChatSounds] ⚠️ Failed to preload ${soundType} sound:`, error);
    }
  });
}

// Helper to get browser/device info for logging
const getBrowserInfo = (): Record<string, any> => {
  if (typeof window === 'undefined') return {};
  
  const nav = navigator as any;
  return {
    userAgent: nav.userAgent || 'unknown',
    platform: nav.platform || 'unknown',
    vendor: nav.vendor || 'unknown',
    deviceMemory: nav.deviceMemory || 'unknown',
    hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
    connection: nav.connection ? {
      effectiveType: nav.connection.effectiveType,
      downlink: nav.connection.downlink,
      rtt: nav.connection.rtt
    } : 'unknown'
  };
};

// Helper to check if device is in Do Not Disturb mode (approximate detection)
const checkDNDState = (): { isDND: boolean; method: string } => {
  if (typeof window === 'undefined') return { isDND: false, method: 'unknown' };
  
  // Check if visibility is hidden (might indicate DND or minimized)
  if (document.visibilityState === 'hidden') {
    return { isDND: true, method: 'visibility_hidden' };
  }
  
  // Check if page is not focused
  if (!document.hasFocus()) {
    return { isDND: true, method: 'not_focused' };
  }
  
  return { isDND: false, method: 'none' };
};

/**
 * Custom hook for chat sounds
 * Provides functions to play different chat-related sounds
 */
export const useChatSounds = (options: ChatSoundOptions = {}) => {
  const { enabled = true, volume = 0.6 } = options;
  const audioUnlockedRef = useRef<boolean>(false);

  // Unlock audio context on first user interaction (bypass autoplay policy)
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      try {
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
              resolve();
            })
            .catch(() => {
              // Will unlock on next user interaction
              resolve();
            });
        } else {
          resolve();
        }
      } catch (err) {
        resolve();
      }
    });
  }, []);

  // Unlock audio on any user interaction
  const setupAudioUnlock = useCallback(() => {
    if (typeof window === 'undefined' || audioUnlockedRef.current) {
      return;
    }

    const unlockOnInteraction = () => {
      unlockAudio();
    };

    const events = ['click', 'pointerdown', 'touchstart', 'keydown'];
    events.forEach(eventType => {
      document.addEventListener(eventType, unlockOnInteraction, { once: true, passive: true });
    });

    // Try to unlock immediately
    unlockAudio();
  }, [unlockAudio]);

  /**
   * Play a chat sound with comprehensive logging and latency tracking
   * @param soundType - Type of sound to play
   * @param options - Additional options (stopPrevious, metadata for logging)
   * @returns Promise that resolves when sound starts playing (or rejects if failed)
   */
  const playSound = useCallback((
    soundType: 'sent' | 'received' | 'typing' | 'read',
    options: { stopPrevious?: boolean; metadata?: PlaySoundMetadata } = {}
  ): Promise<PlaySoundResult> => {
    return new Promise((resolve, reject) => {
      if (!enabled || typeof window === 'undefined') {
        const result: PlaySoundResult = {
          success: false,
          playCallTimestamp: new Date().toISOString(),
          error: 'Sounds disabled or not in browser environment'
        };
        reject(result);
        return;
      }

      // Capture play call timestamp immediately
      const playCallTimestamp = new Date().toISOString();
      
      // Get browser/device info and DND state for logging - safely wrapped
      let browserInfo: Record<string, any> = {};
      let dndState: { isDND: boolean; method: string } = { isDND: false, method: 'unknown' };
      try {
        browserInfo = getBrowserInfo();
      } catch (browserErr) {
        // Ignore browser info errors
      }
      try {
        dndState = checkDNDState();
      } catch (dndErr) {
        // Ignore DND state errors
      }

      // Ensure audio is unlocked
      try {
        setupAudioUnlock();
      } catch (unlockErr) {
        // Ignore unlock errors - audio might still work
      }

      // Map sound types to file paths
      const soundFiles: Record<string, string> = {
        sent: '/sounds/message_sent.mp3',
        received: '/sounds/message_received.mp3',
        typing: '/sounds/typing.mp3',
        read: '/sounds/message_read.mp3',
      };

      const soundFile = soundFiles[soundType];
      if (!soundFile) {
        const result: PlaySoundResult = {
          success: false,
          playCallTimestamp,
          error: `Unknown sound type: ${soundType}`
        };
        console.warn(`[ChatSounds] Unknown sound type: ${soundType}`);
        reject(result);
        return;
      }

      // Track if promise has been resolved/rejected to prevent double resolution
      // Declare outside try block so it's accessible in catch block and error handlers
      let promiseResolved = false;
      let audio: HTMLAudioElement | null = null;

      try {
        // Stop previous sound of the same type if requested
        if (options.stopPrevious && activeAudioInstances.has(soundType)) {
          const previousAudio = activeAudioInstances.get(soundType);
          if (previousAudio) {
            try {
              previousAudio.pause();
              previousAudio.currentTime = 0;
            } catch (e) {
              // Ignore
            }
            activeAudioInstances.delete(soundType);
          }
        }

        // Use preloaded audio if available, otherwise create new instance
        // Preloaded audio is cloned to allow multiple simultaneous plays
        const preloaded = preloadedAudio.get(soundType);
        if (preloaded) {
          // Clone the preloaded audio to allow multiple plays
          audio = preloaded.cloneNode() as HTMLAudioElement;
          audio.volume = volume;
        } else {
          // Fallback: create new audio if preload failed
          audio = new Audio(soundFile);
          audio.volume = volume;
          audio.preload = 'auto';
          // Try to load it immediately
          audio.load();
        }
        
        // Ensure audio is ready to play
        if (audio.readyState < 2) { // HAVE_CURRENT_DATA
          // Audio not ready, wait for it to load
          audio.addEventListener('canplay', () => {
            // Continue with playback
          }, { once: true });
        }
        
        activeAudioInstances.set(soundType, audio);

        const cleanup = () => {
          if (audio) {
            activeAudioInstances.delete(soundType);
            try {
              audio.removeEventListener('ended', cleanup);
              audio.removeEventListener('error', handleError);
            } catch (e) {
              // Ignore
            }
          }
        };

        const handleError = (e: Event | null) => {
          // Prevent double error handling
          if (promiseResolved) {
            return;
          }
          
          // Use a completely safe error handler that never throws
          const safeHandleError = () => {
            try {
              const playFailedTimestamp = new Date().toISOString();
              
              // Extract error message safely - never throw
              let errorMessage = 'Unknown audio error';
              try {
                if (e && e.target) {
                  const audioElement = e.target as HTMLAudioElement;
                  if (audioElement && audioElement.error) {
                    const errorCode = audioElement.error.code || 'unknown';
                    const errorMsg = audioElement.error.message || 'Unknown media error';
                    errorMessage = `MediaError ${errorCode}: ${errorMsg}`;
                  }
                }
              } catch (extractErr) {
                // Ignore errors extracting error message
                errorMessage = 'Error extracting error details';
              }
              
              // Create result object safely
              let result: PlaySoundResult;
              try {
                result = {
                  success: false,
                  playCallTimestamp,
                  playFailedTimestamp,
                  latency: new Date(playFailedTimestamp).getTime() - new Date(playCallTimestamp).getTime(),
                  error: errorMessage
                };
              } catch (resultErr) {
                // Fallback if result creation fails
                result = {
                  success: false,
                  playCallTimestamp,
                  playFailedTimestamp,
                  error: errorMessage
                };
              }
              
              // Log error safely - only use serializable values
              try {
                const safeLogData: Record<string, any> = {
                  soundType: String(soundType),
                  soundFile: String(soundFile),
                  error: String(errorMessage),
                  playCallTimestamp: String(playCallTimestamp),
                  playFailedTimestamp: String(playFailedTimestamp)
                };
                
                // Safely add metadata if present
                if (options.metadata) {
                  try {
                    if (options.metadata.messageId) safeLogData.messageId = String(options.metadata.messageId);
                    if (options.metadata.conversationId) safeLogData.conversationId = String(options.metadata.conversationId);
                    if (options.metadata.serverTimestamp) safeLogData.serverTimestamp = String(options.metadata.serverTimestamp);
                  } catch (metaErr) {
                    // Ignore metadata extraction errors
                  }
                }
                
                console.error(`[ChatSounds] ❌ Error playing ${soundType} sound`, safeLogData);
              } catch (logErr) {
                // If logging fails, just log a simple message
                console.error(`[ChatSounds] ❌ Error playing ${soundType} sound: ${errorMessage}`);
              }
              
              // Cleanup and reject promise
              try {
                cleanup();
              } catch (cleanupErr) {
                // Ignore cleanup errors
              }
              
              if (!promiseResolved) {
                promiseResolved = true;
                try {
                  reject(result);
                } catch (rejectErr) {
                  // If reject fails, log it but don't throw
                  console.error(`[ChatSounds] ❌ Failed to reject promise`);
                }
              }
            } catch (innerErr) {
              // Ultimate fallback - if everything fails, just log and try to reject with minimal data
              console.error(`[ChatSounds] ❌ Critical error in handleError`);
              if (!promiseResolved) {
                promiseResolved = true;
                try {
                  reject({
                    success: false,
                    playCallTimestamp,
                    error: 'Critical error in error handler'
                  });
                } catch (finalErr) {
                  // If even this fails, there's nothing we can do
                }
              }
            }
          };
          
          // Execute the safe handler
          safeHandleError();
        };

        // Validate audio element exists before proceeding
        if (!audio) {
          const result: PlaySoundResult = {
            success: false,
            playCallTimestamp,
            error: 'Audio element not created'
          };
          try {
            reject(result);
          } catch (rejectErr) {
            // If reject fails, there's nothing we can do
          }
          return;
        }

        // Safely add event listeners
        try {
          audio.addEventListener('ended', cleanup);
          audio.addEventListener('error', handleError);
        } catch (listenerErr) {
          // If adding listeners fails, log but continue - playback might still work
          console.warn(`[ChatSounds] ⚠️ Failed to add event listeners:`, listenerErr);
        }

        // Log comprehensive info before playing - safely serialize all values
        try {
          const safeLogData: Record<string, any> = {
            soundType: String(soundType),
            soundFile: String(soundFile),
            playCallTimestamp: String(playCallTimestamp),
            enabled: Boolean(enabled),
            volume: Number(volume)
          };
          
          // Safely get audio readyState
          try {
            if (audio && typeof audio.readyState === 'number') {
              safeLogData.audioReadyState = Number(audio.readyState);
            } else {
              safeLogData.audioReadyState = 0;
            }
          } catch (readyStateErr) {
            safeLogData.audioReadyState = 0;
          }
          
          // Safely add metadata
          if (options.metadata) {
            try {
              if (options.metadata.serverTimestamp) safeLogData.serverTimestamp = String(options.metadata.serverTimestamp);
              if (options.metadata.clientReceiveTimestamp) safeLogData.clientReceiveTimestamp = String(options.metadata.clientReceiveTimestamp);
              if (options.metadata.uiUpdateTimestamp) safeLogData.uiUpdateTimestamp = String(options.metadata.uiUpdateTimestamp);
              if (options.metadata.messageId) safeLogData.messageId = String(options.metadata.messageId);
              if (options.metadata.conversationId) safeLogData.conversationId = String(options.metadata.conversationId);
            } catch (metaErr) {
              // Ignore metadata errors
            }
          }
          
          console.log(`[ChatSounds] 🎵 Attempting to play ${soundType} sound:`, safeLogData);
        } catch (logErr) {
          // If logging fails, just log a simple message
          console.log(`[ChatSounds] 🎵 Attempting to play ${soundType} sound`);
        }

        // Play audio and handle promise - wrap in try-catch for safety
        let playPromise: Promise<void> | undefined;
        try {
          playPromise = audio.play();
        } catch (playErr) {
          // If play() itself throws, handle it as an error
          const playFailedTimestamp = new Date().toISOString();
          const result: PlaySoundResult = {
            success: false,
            playCallTimestamp,
            playFailedTimestamp,
            latency: new Date(playFailedTimestamp).getTime() - new Date(playCallTimestamp).getTime(),
            error: playErr instanceof Error ? playErr.message : String(playErr)
          };
          try {
            cleanup();
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
          try {
            if (!promiseResolved) {
              promiseResolved = true;
              reject(result);
            }
          } catch (rejectErr) {
            // If reject fails, log it
            console.error(`[ChatSounds] ❌ Failed to reject promise after play() error`);
          }
          return;
        }

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Prevent double resolution
              if (promiseResolved) {
                return;
              }
              promiseResolved = true;
              
              const playResolvedTimestamp = new Date().toISOString();
              const latency = new Date(playResolvedTimestamp).getTime() - new Date(playCallTimestamp).getTime();
              const result: PlaySoundResult = {
                success: true,
                playCallTimestamp,
                playResolvedTimestamp,
                latency
              };
              // Log success safely
              try {
                const safeSuccessLog: Record<string, any> = {
                  soundType: String(soundType),
                  playCallTimestamp: String(result.playCallTimestamp),
                  playResolvedTimestamp: String(result.playResolvedTimestamp || ''),
                  latency: result.latency ? Number(result.latency) : 0
                };
                console.log(`[ChatSounds] 🔊 Successfully playing ${soundType} sound:`, safeSuccessLog);
              } catch (logErr) {
                console.log(`[ChatSounds] 🔊 Successfully playing ${soundType} sound`);
              }
              resolve(result);
            })
            .catch((error) => {
              // Prevent double rejection
              if (promiseResolved) {
                return;
              }
              promiseResolved = true;
              
              try {
                const playFailedTimestamp = new Date().toISOString();
                const latency = new Date(playFailedTimestamp).getTime() - new Date(playCallTimestamp).getTime();
                // Extract error message safely
                let errorMessage = 'Unknown error';
                if (error) {
                  if (error.message) {
                    errorMessage = error.message;
                  } else if (typeof error === 'string') {
                    errorMessage = error;
                  } else {
                    errorMessage = String(error);
                  }
                }
                
                const result: PlaySoundResult = {
                  success: false,
                  playCallTimestamp,
                  playFailedTimestamp,
                  latency,
                  error: errorMessage
                };
                // Log warning safely
                try {
                  const safeWarnLog: Record<string, any> = {
                    soundType: String(soundType),
                    error: String(errorMessage),
                    playCallTimestamp: String(result.playCallTimestamp),
                    playFailedTimestamp: String(result.playFailedTimestamp || ''),
                    latency: result.latency ? Number(result.latency) : 0
                  };
                  console.warn(`[ChatSounds] ⚠️ Could not play ${soundType} sound (autoplay may be blocked):`, safeWarnLog);
                } catch (logErr) {
                  console.warn(`[ChatSounds] ⚠️ Could not play ${soundType} sound: ${errorMessage}`);
                }
                cleanup();
                reject(result);
              } catch (err) {
                // Fallback error handling
                console.error(`[ChatSounds] ❌ Error in playPromise catch:`, err);
                cleanup();
                reject({
                  success: false,
                  playCallTimestamp,
                  playFailedTimestamp: new Date().toISOString(),
                  error: 'Error handling failed'
                });
              }
            });
        } else {
          // Legacy browser - assume it worked
          if (!promiseResolved) {
            promiseResolved = true;
            const playResolvedTimestamp = new Date().toISOString();
            const latency = new Date(playResolvedTimestamp).getTime() - new Date(playCallTimestamp).getTime();
            const result: PlaySoundResult = {
              success: true,
              playCallTimestamp,
              playResolvedTimestamp,
              latency
            };
            // Log legacy browser playback safely
            try {
              const safeLegacyLog: Record<string, any> = {
                soundType: String(soundType),
                playCallTimestamp: String(result.playCallTimestamp),
                playResolvedTimestamp: String(result.playResolvedTimestamp || ''),
                latency: result.latency ? Number(result.latency) : 0
              };
              console.log(`[ChatSounds] 🔊 Playing ${soundType} sound (legacy browser):`, safeLegacyLog);
            } catch (logErr) {
              console.log(`[ChatSounds] 🔊 Playing ${soundType} sound (legacy browser)`);
            }
            resolve(result);
          }
        }
      } catch (error) {
        if (!promiseResolved) {
          promiseResolved = true;
          try {
            const playFailedTimestamp = new Date().toISOString();
            const latency = new Date(playFailedTimestamp).getTime() - new Date(playCallTimestamp).getTime();
            // Extract error message safely
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message;
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else if (error) {
              errorMessage = String(error);
            }
            
            const result: PlaySoundResult = {
              success: false,
              playCallTimestamp,
              playFailedTimestamp,
              latency,
              error: errorMessage
            };
            // Log error safely
            try {
              const safeErrorLog: Record<string, any> = {
                soundType: String(soundType),
                soundFile: String(soundFile),
                error: String(errorMessage),
                playCallTimestamp: String(result.playCallTimestamp),
                playFailedTimestamp: String(result.playFailedTimestamp || ''),
                latency: result.latency ? Number(result.latency) : 0
              };
              
              // Safely add metadata
              if (options.metadata) {
                if (options.metadata.messageId) safeErrorLog.messageId = String(options.metadata.messageId);
                if (options.metadata.conversationId) safeErrorLog.conversationId = String(options.metadata.conversationId);
              }
              
              console.error(`[ChatSounds] ❌ Failed to play ${soundType} sound:`, safeErrorLog);
            } catch (logErr) {
              console.error(`[ChatSounds] ❌ Failed to play ${soundType} sound: ${errorMessage}`);
            }
            reject(result);
          } catch (err) {
            // Fallback error handling
            console.error(`[ChatSounds] ❌ Error in catch block:`, err);
            reject({
              success: false,
              playCallTimestamp,
              playFailedTimestamp: new Date().toISOString(),
              error: 'Error handling failed'
            });
          }
        }
      }
    });
  }, [enabled, volume, setupAudioUnlock]);

  /**
   * Play message sent sound
   * Should only be called when sender sends a message while both users are in the same conversation
   */
  const playMessageSent = useCallback((metadata?: PlaySoundMetadata): Promise<PlaySoundResult> => {
    return playSound('sent', { stopPrevious: true, metadata });
  }, [playSound]);

  /**
   * Play message received sound
   * Should only be called when recipient receives a message while viewing the conversation
   */
  const playMessageReceived = useCallback((metadata?: PlaySoundMetadata): Promise<PlaySoundResult> => {
    return playSound('received', { stopPrevious: true, metadata });
  }, [playSound]);

  /**
   * Play typing sound
   * Should only be called when other participant is typing
   */
  const playTyping = useCallback((metadata?: PlaySoundMetadata): Promise<PlaySoundResult> => {
    return playSound('typing', { stopPrevious: false, metadata }); // Don't stop previous to allow continuous typing sounds
  }, [playSound]);

  /**
   * Play message read sound
   * Should only be called when recipient reads sender's message
   * @param metadata - Optional metadata for logging (serverTimestamp, clientReceiveTimestamp, uiUpdateTimestamp, messageId, conversationId)
   * @returns Promise that resolves when sound starts playing
   */
  const playMessageRead = useCallback((metadata?: PlaySoundMetadata): Promise<PlaySoundResult> => {
    return playSound('read', { stopPrevious: true, metadata });
  }, [playSound]);
  
  /**
   * Prime/ensure audio is ready for immediate playback
   * Call this when conversation opens to reduce latency
   */
  const primeReadSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const preloaded = preloadedAudio.get('read');
    if (preloaded) {
      // Ensure audio is loaded and ready
      if (preloaded.readyState < 2) {
        preloaded.load();
      }
      // Try to unlock audio context
      setupAudioUnlock();
      console.log(`[ChatSounds] ✅ Primed read sound (readyState: ${preloaded.readyState})`);
    } else {
      // Create and preload if not already done
      try {
        const audio = new Audio('/sounds/message_read.mp3');
        audio.preload = 'auto';
        audio.load();
        preloadedAudio.set('read', audio);
        setupAudioUnlock();
        console.log(`[ChatSounds] ✅ Created and primed read sound`);
      } catch (error) {
        console.warn(`[ChatSounds] ⚠️ Failed to prime read sound:`, error);
      }
    }
  }, [setupAudioUnlock]);

  /**
   * Stop all active sounds
   */
  const stopAllSounds = useCallback(() => {
    activeAudioInstances.forEach((audio, soundType) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {
        // Ignore
      }
    });
    activeAudioInstances.clear();
  }, []);

  return {
    playMessageSent,
    playMessageReceived,
    playTyping,
    playMessageRead,
    primeReadSound,
    stopAllSounds,
    setupAudioUnlock,
  };
};

// Export types for use in other modules
export type { PlaySoundMetadata, PlaySoundResult };

export default useChatSounds;

