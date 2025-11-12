/**
 * Unified NotificationDispatcher
 * 
 * Buffers incoming notification/status events, coalesces duplicates,
 * and dispatches unified updates to all UI surfaces (toaster, popover, inbox, bell count, message counts).
 * 
 * Features:
 * - Configurable buffer delay (default 300ms, tunable 200-2000ms)
 * - Event coalescing/deduplication
 * - High-priority event bypass (calls/critical alerts)
 * - Metrics tracking (latency, duplicate counts, mismatched surfaces, coalesce rates, buffer hit rate, dedup rate)
 * 
 * Configuration:
 * - Default: 300ms (reduced from 1500ms for faster, more responsive UX)
 * - Minimum: 200ms (for even snappier UX if needed)
 * - Maximum: 2000ms (for slower, more conservative updates if needed)
 * - Configurable via:
 *   1. window.__BUFFER_DELAY_MS (runtime, highest priority)
 *   2. REACT_APP_NOTIFICATION_BUFFER_DELAY_MS (build-time env var)
 *   3. localStorage.getItem('notification_buffer_delay_ms') (runtime feature flag)
 * 
 * Metrics:
 * - notification_dispatch_latency: Dispatch processing time (add BUFFER_DELAY_MS for total latency)
 * - duplicate_toasts_count: Number of duplicate toasts filtered
 * - mismatched_surfaces: Count of surface update inconsistencies
 * - status_update_coalesce_rate: Percentage of status updates that were coalesced (merged)
 * 
 * Expected total latency: BUFFER_DELAY_MS + dispatchLatency + network_time
 * 
 * Status Update Coalescing:
 * - Multiple status updates for the same messageId (e.g., Sent → Delivered → Read) are merged
 * - Only the highest priority status is kept and applied to UI
 * - Intermediate statuses are skipped to prevent flicker
 */

export type NotificationEventType = 
  | 'notification'
  | 'message:sent'
  | 'message:delivered'
  | 'message:seen'
  | 'message:status_update'
  | 'notification:refresh'
  | 'notification:count_update'
  | 'message:count_update'; // Conversation message count updates

export interface NotificationEvent {
  type: NotificationEventType;
  payload: any;
  timestamp: number;
  priority?: 'high' | 'normal'; // High priority bypasses buffer
  source?: string; // Source identifier for deduplication
}

export interface StatusUpdate {
  status: string;
  seq: number;
  timestamp: number;
  nodeId?: string; // Node ID for tie-breaking in multi-instance deployments
}

export interface DispatchedUpdate {
  notifications: any[];
  statusUpdates: Map<string, string>; // messageId -> status (for backward compatibility)
  statusUpdatesWithSeq: Map<string, StatusUpdate>; // messageId -> { status, seq, timestamp }
  countUpdates: { unreadCount?: number }; // Notification bell count
  conversationCountUpdates: Map<string, number>; // conversationId -> unreadCount increment
  refreshNeeded: boolean; // Whether a refresh is needed
  timestamp: number;
}

type DispatchCallback = (update: DispatchedUpdate) => void;

// Configuration
const BUFFER_DELAY_MS = (() => {
  const MIN_DELAY_MS = 100; // Minimum for snappier UX (reduced for faster Sent → Delivered transitions)
  const MAX_DELAY_MS = 2000;
  const DEFAULT_DELAY_MS = 150; // Reduced from 300ms to 150ms for faster, more responsive UX while maintaining smooth transitions
  
  // Priority order:
  // 1. window.__BUFFER_DELAY_MS (runtime, highest priority)
  // 2. REACT_APP_NOTIFICATION_BUFFER_DELAY_MS (build-time env var)
  // 3. localStorage (runtime feature flag)
  // 4. Default (150ms - reduced from 300ms for faster Sent → Delivered transitions)
  
  // Try window global first (for runtime configuration - highest priority)
  if (typeof window !== 'undefined') {
    const envValue = (window as any).__BUFFER_DELAY_MS;
    if (typeof envValue === 'number' && envValue >= MIN_DELAY_MS && envValue <= MAX_DELAY_MS) {
      console.log(`[NotificationDispatcher] Using buffer delay from window.__BUFFER_DELAY_MS: ${envValue}ms`);
      return envValue;
    }
  }
  
  // Try React environment variable (build-time configuration)
  // React injects REACT_APP_* env vars at build time
  const reactAppValue = process.env.REACT_APP_NOTIFICATION_BUFFER_DELAY_MS;
  if (reactAppValue) {
    const parsed = parseInt(reactAppValue, 10);
    if (!isNaN(parsed) && parsed >= MIN_DELAY_MS && parsed <= MAX_DELAY_MS) {
      console.log(`[NotificationDispatcher] Using buffer delay from REACT_APP_NOTIFICATION_BUFFER_DELAY_MS: ${parsed}ms`);
      return parsed;
    } else if (!isNaN(parsed)) {
      console.warn(`[NotificationDispatcher] REACT_APP_NOTIFICATION_BUFFER_DELAY_MS value ${parsed}ms is outside valid range (${MIN_DELAY_MS}-${MAX_DELAY_MS}ms), using default ${DEFAULT_DELAY_MS}ms`);
    }
  }
  
  // Try localStorage as fallback (for runtime feature flags)
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('notification_buffer_delay_ms');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_DELAY_MS && parsed <= MAX_DELAY_MS) {
          console.log(`[NotificationDispatcher] Using buffer delay from localStorage: ${parsed}ms`);
          return parsed;
        } else if (!isNaN(parsed)) {
          console.warn(`[NotificationDispatcher] Buffer delay ${parsed}ms from localStorage is outside valid range (${MIN_DELAY_MS}-${MAX_DELAY_MS}ms), using default ${DEFAULT_DELAY_MS}ms`);
        }
      }
    } catch (e) {
      // Ignore localStorage errors (e.g., in private browsing mode)
    }
  }
  
  // Default: 300ms (0.3 seconds) - reduced for faster, more responsive UX
  // Can be tuned to 200ms for even snappier UX via config
  console.log(`[NotificationDispatcher] Using default buffer delay: ${DEFAULT_DELAY_MS}ms`);
  return DEFAULT_DELAY_MS;
})();

// High-priority event types that bypass the buffer
const HIGH_PRIORITY_EVENT_TYPES: NotificationEventType[] = [
  'message:seen', // Read events must be immediate - no buffer delay
  // Add other high-priority event types here (e.g., 'call:incoming', 'critical:alert')
];

class NotificationDispatcher {
  private buffer: NotificationEvent[] = [];
  private dispatchTimer: NodeJS.Timeout | null = null;
  private callbacks: Set<DispatchCallback> = new Set();
  private metrics = {
    totalEvents: 0,
    duplicateEvents: 0,
    duplicateToastsCount: 0, // Specifically track duplicate toasts
    highPriorityEvents: 0,
    dispatchLatencies: [] as number[], // notification_dispatch_latency
    lastDispatchTime: 0,
    mismatchedSurfaces: 0, // Track when surfaces update inconsistently
    surfaceUpdateTimestamps: new Map<string, number>(), // surface -> last update timestamp
    // Status update coalescing metrics
    statusUpdateEventsTotal: 0, // Total status update events received
    statusUpdateEventsCoalesced: 0, // Number of status updates that were merged (coalesced)
    statusUpdateEventsByMessageId: new Map<string, number>(), // messageId -> count of updates received
    // Buffer and deduplication metrics
    bufferHits: 0, // Events that were buffered (not immediate)
    immediateDispatches: 0, // Events that bypassed buffer (high priority)
    lateDeliveryCount: 0, // Events that arrived after buffer window closed
    bufferStartTime: 0, // When current buffer window started
  };

  // Deduplication tracking
  private eventSignatures: Map<string, number> = new Map(); // signature -> timestamp
  private readonly DEDUP_WINDOW_MS = 1000; // Deduplicate events within 1 second

  /**
   * Generate a signature for deduplication
   */
  private getEventSignature(event: NotificationEvent): string {
    const { type, payload, source } = event;
    
    // For notifications, use type + key metadata
    if (type === 'notification') {
      const { type: notifType, metadata } = payload;
      if (notifType === 'message' && metadata?.messageId) {
        return `notification:message:${metadata.messageId}`;
      }
      if (notifType === 'connection_request' && payload.actor?._id) {
        return `notification:connection_request:${payload.actor._id}`;
      }
      // Use type + actor + timestamp for other notifications
      return `notification:${notifType}:${payload.actor?._id || 'unknown'}:${Math.floor(payload.timestamp / 1000)}`;
    }
    
    // For message status updates, use messageId + status
    if (type === 'message:sent' || type === 'message:delivered' || type === 'message:seen') {
      const messageId = payload.messageId || payload.conversationId;
      const status = type.split(':')[1];
      return `message:${messageId}:${status}:${payload.seq || 0}`;
    }
    
    // For status updates, use messageId + status
    if (type === 'message:status_update') {
      return `status:${payload.messageId}:${payload.status}`;
    }
    
    // For count updates, use type
    if (type === 'notification:count_update' || type === 'notification:refresh') {
      return `${type}:${Math.floor(event.timestamp / 1000)}`;
    }
    
    // For conversation count updates, use conversationId to deduplicate
    if (type === 'message:count_update') {
      const conversationId = payload.conversationId;
      return `message:count:${conversationId}:${Math.floor(event.timestamp / 100)}`;
    }
    
    // Fallback: use type + source + timestamp
    return `${type}:${source || 'unknown'}:${Math.floor(event.timestamp / 100)}`;
  }

  /**
   * Check if event is a duplicate
   */
  private isDuplicate(event: NotificationEvent): boolean {
    const signature = this.getEventSignature(event);
    const now = Date.now();
    const lastSeen = this.eventSignatures.get(signature);
    
    if (lastSeen && (now - lastSeen) < this.DEDUP_WINDOW_MS) {
      return true;
    }
    
    // Update signature timestamp
    this.eventSignatures.set(signature, now);
    
    // Clean up old signatures (older than DEDUP_WINDOW_MS)
    const signaturesToDelete: string[] = [];
    this.eventSignatures.forEach((timestamp, sig) => {
      if (now - timestamp > this.DEDUP_WINDOW_MS * 2) {
        signaturesToDelete.push(sig);
      }
    });
    signaturesToDelete.forEach(sig => {
      this.eventSignatures.delete(sig);
    });
    
    return false;
  }

  /**
   * Add event to buffer or dispatch immediately if high-priority
   */
  public dispatch(event: NotificationEvent): void {
    this.metrics.totalEvents++;
    
    // Check if high-priority (bypass buffer)
    const isHighPriority = 
      event.priority === 'high' || 
      HIGH_PRIORITY_EVENT_TYPES.includes(event.type);
    
    if (isHighPriority) {
      this.metrics.highPriorityEvents++;
      this.metrics.immediateDispatches++;
      this.flushImmediate(event);
      return;
    }
    
    // Check for duplicates
    if (this.isDuplicate(event)) {
      this.metrics.duplicateEvents++;
      console.log('[NotificationDispatcher] ⏭️ Duplicate event detected, skipping:', event.type);
      return;
    }
    
    // Track buffer start time if this is the first event in a new buffer window
    const now = Date.now();
    if (this.buffer.length === 0 && !this.dispatchTimer) {
      this.metrics.bufferStartTime = now;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime Buffer] 🕐 Starting new buffer window (${BUFFER_DELAY_MS}ms delay)`);
      }
    }
    
    // Check for late delivery (event arriving after buffer window should have closed)
    if (this.metrics.bufferStartTime > 0 && (now - this.metrics.bufferStartTime) > BUFFER_DELAY_MS * 1.5) {
      this.metrics.lateDeliveryCount++;
      console.warn(`[NotificationDispatcher] ⚠️ Late delivery detected: event arrived ${now - this.metrics.bufferStartTime}ms after buffer start (expected < ${BUFFER_DELAY_MS}ms)`);
    }
    
    // Add to buffer
    this.buffer.push(event);
    this.metrics.bufferHits++;
    
    // Log batching in dev mode
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Realtime Buffer] 📦 Batching events... count: ${this.buffer.length}`);
    }
    
    // Reset timer (debounce)
    if (this.dispatchTimer) {
      clearTimeout(this.dispatchTimer);
    }
    
    // Schedule dispatch
    this.dispatchTimer = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Realtime Buffer] 🚀 Dispatch → after ${BUFFER_DELAY_MS}ms (${this.buffer.length} events)`);
      }
      this.flush();
    }, BUFFER_DELAY_MS);
  }

  /**
   * Flush buffer and dispatch to all callbacks
   */
  private flush(): void {
    if (this.buffer.length === 0) {
      this.dispatchTimer = null;
      this.metrics.bufferStartTime = 0;
      return;
    }
    
    const flushStartTime = Date.now();
    const events = [...this.buffer];
    this.buffer = [];
    this.dispatchTimer = null;
    
    // Reset buffer start time
    this.metrics.bufferStartTime = 0;
    
    // Coalesce events
    const coalesced = this.coalesceEvents(events);
    
    // Count duplicate toasts in this batch (notifications that were filtered out during coalescing)
    let duplicateToastsInBatch = 0;
    events.forEach(e => {
      if (e.type === 'notification') {
        const notif = e.payload;
        const isDuplicate = coalesced.notifications.some(n => {
          if (n.type === notif.type) {
            if (notif.type === 'message' && n.metadata?.messageId === notif.metadata?.messageId) {
              return true;
            }
            if (notif.type === 'connection_request' && n.actor?._id === notif.actor?._id) {
              return true;
            }
          }
          return false;
        });
        if (isDuplicate) {
          duplicateToastsInBatch++;
        }
      }
    });
    
    if (duplicateToastsInBatch > 0) {
      this.metrics.duplicateToastsCount += duplicateToastsInBatch;
    }
    
    // Track callback execution times to detect mismatched surfaces
    const callbackTimestamps: number[] = [];
    
    // Dispatch to all callbacks
    this.callbacks.forEach((callback, index) => {
      try {
        const callbackStart = Date.now();
        callback(coalesced);
        const callbackEnd = Date.now();
        callbackTimestamps.push(callbackEnd - callbackStart);
      } catch (error) {
        console.error('[NotificationDispatcher] Error in callback:', error);
      }
    });
    
    // Calculate dispatch latency (time from flush start to all callbacks complete)
    // Note: Total latency from event arrival to UI update = BUFFER_DELAY_MS + dispatchLatency + network_time
    // This metric tracks the dispatch processing time; add BUFFER_DELAY_MS for total end-to-end latency
    const dispatchLatency = Date.now() - flushStartTime;
    this.metrics.dispatchLatencies.push(dispatchLatency);
    this.metrics.lastDispatchTime = Date.now();
    
    // Check for mismatched surfaces (if callbacks took significantly different amounts of time)
    if (callbackTimestamps.length > 1) {
      const maxCallbackTime = Math.max(...callbackTimestamps);
      const minCallbackTime = Math.min(...callbackTimestamps);
      const timeDiff = maxCallbackTime - minCallbackTime;
      // If callback times differ by more than 50ms, consider it a mismatch
      if (timeDiff > 50) {
        this.metrics.mismatchedSurfaces++;
        console.warn(`[NotificationDispatcher] ⚠️ Surface update mismatch detected: ${timeDiff}ms difference between fastest (${minCallbackTime}ms) and slowest (${maxCallbackTime}ms) callback`);
      }
    }
    
    // Track surface update timestamps for cross-dispatch mismatch detection
    const currentTime = Date.now();
    this.callbacks.forEach((callback, index) => {
      const surfaceId = `surface_${index}`;
      this.metrics.surfaceUpdateTimestamps.set(surfaceId, currentTime);
    });
    
    // Keep only last 100 latency measurements
    if (this.metrics.dispatchLatencies.length > 100) {
      this.metrics.dispatchLatencies.shift();
    }
    
    // Calculate how many status updates were coalesced in this batch
    const statusEventsInBatch = events.filter(e => 
      e.type === 'message:sent' || e.type === 'message:delivered' || e.type === 'message:seen' || e.type === 'message:status_update'
    ).length;
    const statusUpdatesCoalesced = Math.max(0, statusEventsInBatch - coalesced.statusUpdates.size);
    
    console.log(`[NotificationDispatcher] ✅ Dispatched ${events.length} events (coalesced to ${coalesced.notifications.length} notifications, ${coalesced.statusUpdates.size} status updates from ${statusEventsInBatch} events [${statusUpdatesCoalesced} coalesced], ${duplicateToastsInBatch} duplicates filtered) in ${dispatchLatency}ms`);
  }

  /**
   * Flush immediately (for high-priority events)
   */
  private flushImmediate(event: NotificationEvent): void {
    const coalesced = this.coalesceEvents([event]);
    
    this.callbacks.forEach(callback => {
      try {
        callback(coalesced);
      } catch (error) {
        console.error('[NotificationDispatcher] Error in callback:', error);
      }
    });
    
    console.log(`[NotificationDispatcher] ⚡ Immediate dispatch (high-priority):`, event.type);
  }

  /**
   * Coalesce events into unified update
   */
  private coalesceEvents(events: NotificationEvent[]): DispatchedUpdate {
    const notifications: any[] = [];
    const statusUpdates = new Map<string, string>(); // For backward compatibility
    const statusUpdatesWithSeq = new Map<string, StatusUpdate>(); // messageId -> { status, seq, timestamp }
    const countUpdates: { unreadCount?: number } = {};
    const conversationCountUpdates = new Map<string, number>(); // conversationId -> increment
    let refreshNeeded = false;
    
    // Process events in order
    for (const event of events) {
      switch (event.type) {
        case 'notification':
          // Deduplicate notifications by messageId/actorId
          const notif = event.payload;
          const isDuplicate = notifications.some(n => {
            if (n.type === notif.type) {
              if (notif.type === 'message' && n.metadata?.messageId === notif.metadata?.messageId) {
                return true;
              }
              if (notif.type === 'connection_request' && n.actor?._id === notif.actor?._id) {
                return true;
              }
            }
            return false;
          });
          
          if (!isDuplicate) {
            notifications.push(notif);
          }
          break;
          
        case 'message:sent':
        case 'message:delivered':
        case 'message:seen':
          // Coalesce status updates - keep latest status for each messageId
          // CRITICAL: Use sequence numbers and timestamps to prevent out-of-order updates
          const messageId = event.payload.messageId;
          if (messageId) {
            // Track status update event
            this.metrics.statusUpdateEventsTotal++;
            
            // Count updates per messageId to detect coalescing
            const currentCount = this.metrics.statusUpdateEventsByMessageId.get(messageId) || 0;
            this.metrics.statusUpdateEventsByMessageId.set(messageId, currentCount + 1);
            
            const status = this.getStatusFromEventType(event.type);
            const eventSeq = event.payload.seq ?? this.getDefaultSeqForStatus(status);
            const eventTimestamp = event.payload.timestamp ? new Date(event.payload.timestamp).getTime() : event.timestamp;
            const eventNodeId = event.payload.nodeId || '';
            
            // Get current status update (with sequence info)
            const currentStatusUpdate = statusUpdatesWithSeq.get(messageId);
            const currentStatus = currentStatusUpdate?.status;
            
            // CRITICAL: Only accept status update if:
            // 1. No current status exists, OR
            // 2. New status is higher priority AND has newer/equal sequence, OR
            // 3. New status has same priority but newer sequence (for same-status updates)
            // Primary ordering: sequence number
            // Tie-breaker 1: timestamp (if seq equal)
            // Tie-breaker 2: node-id (if seq and timestamp equal) - for multi-instance reliability
            let shouldUpdate = false;
            
            if (!currentStatusUpdate) {
              // First status for this messageId
              shouldUpdate = true;
            } else {
              const currentSeq = currentStatusUpdate.seq;
              const currentTimestamp = currentStatusUpdate.timestamp;
              const currentNodeId = currentStatusUpdate.nodeId || '';
              const isHigherPriority = currentStatus ? this.isHigherPriorityStatus(status, currentStatus) : true;
              const isNewerSeq = eventSeq > currentSeq;
              const isEqualSeqNewerTimestamp = eventSeq === currentSeq && eventTimestamp > currentTimestamp;
              const isEqualSeqEqualTimestampNewerNodeId = eventSeq === currentSeq && eventTimestamp === currentTimestamp && eventNodeId > currentNodeId;
              const isNewerEvent = isNewerSeq || isEqualSeqNewerTimestamp || isEqualSeqEqualTimestampNewerNodeId;
              
              // Only update if:
              // - New status is higher priority (always accept), OR
              // - Same priority but newer sequence (for same-status updates with newer info)
              // Never accept lower priority status, even with newer sequence
              if (isHigherPriority) {
                shouldUpdate = true;
              } else if (currentStatus && status === currentStatus && isNewerEvent) {
                // Same status but newer sequence/timestamp/node-id - update to keep latest info
                shouldUpdate = true;
              } else if (currentStatus && this.isHigherPriorityStatus(currentStatus, status)) {
                // Current status is higher priority - ignore this update
                console.log(`[NotificationDispatcher] ⏭️ Ignoring lower priority status: ${messageId} -> ${status} (seq ${eventSeq}) (current: ${currentStatus}, seq ${currentSeq})`);
                this.metrics.statusUpdateEventsCoalesced++;
                shouldUpdate = false;
              } else {
                // Same priority but older sequence/timestamp/node-id - ignore
                console.log(`[NotificationDispatcher] ⏭️ Ignoring older sequence status: ${messageId} -> ${status} (seq ${eventSeq} <= ${currentSeq}) (current: ${currentStatus || 'none'})`);
                this.metrics.statusUpdateEventsCoalesced++;
                shouldUpdate = false;
              }
            }
            
            if (shouldUpdate) {
              statusUpdatesWithSeq.set(messageId, {
                status,
                seq: eventSeq,
                timestamp: eventTimestamp,
                nodeId: eventNodeId,
              });
              statusUpdates.set(messageId, status); // For backward compatibility
              
              if (currentStatus) {
                // This is a coalesced update (merged with previous status)
                this.metrics.statusUpdateEventsCoalesced++;
              }
            }
          }
          break;
          
        case 'message:status_update':
          // Direct status update
          if (event.payload.messageId && event.payload.status) {
            const messageId = event.payload.messageId;
            // Track status update event
            this.metrics.statusUpdateEventsTotal++;
            
            // Count updates per messageId to detect coalescing
            const currentCount = this.metrics.statusUpdateEventsByMessageId.get(messageId) || 0;
            this.metrics.statusUpdateEventsByMessageId.set(messageId, currentCount + 1);
            
            const currentStatus = statusUpdates.get(messageId);
            if (currentStatus) {
              // Coalesced update (replacing existing status)
              this.metrics.statusUpdateEventsCoalesced++;
            }
            statusUpdates.set(messageId, event.payload.status);
          }
          break;
          
        case 'notification:count_update':
          // Accumulate count increments (coalesce multiple increments)
          if (event.payload.increment !== undefined) {
            countUpdates.unreadCount = (countUpdates.unreadCount || 0) + event.payload.increment;
          } else if (event.payload.unreadCount !== undefined) {
            // Direct count value (use latest)
            countUpdates.unreadCount = event.payload.unreadCount;
          }
          break;
          
        case 'notification:refresh':
          // Set refresh flag (don't add to notifications array)
          refreshNeeded = true;
          break;
          
        case 'message:count_update':
          // Accumulate conversation count increments (coalesce multiple increments per conversation)
          const conversationId = event.payload.conversationId;
          const increment = event.payload.increment || 1;
          if (conversationId) {
            const currentIncrement = conversationCountUpdates.get(conversationId) || 0;
            conversationCountUpdates.set(conversationId, currentIncrement + increment);
          }
          break;
      }
    }
    
    return {
      notifications,
      statusUpdates,
      statusUpdatesWithSeq,
      countUpdates,
      conversationCountUpdates,
      refreshNeeded,
      timestamp: Date.now(),
    };
  }

  /**
   * Get default sequence number for a status (if not provided in event)
   */
  private getDefaultSeqForStatus(status: string): number {
    switch (status) {
      case 'Sent':
        return 1;
      case 'Delivered':
        return 2;
      case 'Read':
        return 3;
      default:
        return 0;
    }
  }

  /**
   * Get status string from event type
   */
  private getStatusFromEventType(type: NotificationEventType): string {
    switch (type) {
      case 'message:sent':
        return 'Sent';
      case 'message:delivered':
        return 'Delivered';
      case 'message:seen':
        return 'Read';
      default:
        return 'Unknown';
    }
  }

  /**
   * Check if status1 is higher priority than status2
   */
  private isHigherPriorityStatus(status1: string, status2: string): boolean {
    const priority: Record<string, number> = {
      'In progress...': 0,
      'Sent': 1,
      'Delivered': 2,
      'Read': 3,
    };
    return (priority[status1] || 0) > (priority[status2] || 0);
  }

  /**
   * Register callback for dispatched updates
   */
  public onDispatch(callback: DispatchCallback): () => void {
    this.callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get metrics for monitoring
   */
  public getMetrics() {
    const avgLatency = this.metrics.dispatchLatencies.length > 0
      ? this.metrics.dispatchLatencies.reduce((a, b) => a + b, 0) / this.metrics.dispatchLatencies.length
      : 0;
    
    // Calculate status update coalesce rate
    const coalesceRate = this.metrics.statusUpdateEventsTotal > 0
      ? (this.metrics.statusUpdateEventsCoalesced / this.metrics.statusUpdateEventsTotal) * 100
      : 0;
    
    // Calculate buffer hit rate (percentage of events that were buffered vs immediate)
    const totalDispatched = this.metrics.bufferHits + this.metrics.immediateDispatches;
    const bufferHitRate = totalDispatched > 0
      ? (this.metrics.bufferHits / totalDispatched) * 100
      : 0;
    
    // Calculate dedup rate (percentage of events that were duplicates)
    const dedupRate = this.metrics.totalEvents > 0
      ? (this.metrics.duplicateEvents / this.metrics.totalEvents) * 100
      : 0;
    
    return {
      totalEvents: this.metrics.totalEvents,
      duplicateEvents: this.metrics.duplicateEvents,
      duplicateToastsCount: this.metrics.duplicateToastsCount,
      highPriorityEvents: this.metrics.highPriorityEvents,
      notification_dispatch_latency: {
        average: avgLatency,
        min: this.metrics.dispatchLatencies.length > 0 ? Math.min(...this.metrics.dispatchLatencies) : 0,
        max: this.metrics.dispatchLatencies.length > 0 ? Math.max(...this.metrics.dispatchLatencies) : 0,
        recent: this.metrics.dispatchLatencies.slice(-10), // Last 10 measurements
        all: this.metrics.dispatchLatencies,
        // Note: Total end-to-end latency ≈ bufferDelay + average + network_time
        // Expected total latency should be approximately BUFFER_DELAY_MS + network_time
        estimatedTotalLatency: BUFFER_DELAY_MS + avgLatency,
      },
      status_update_coalesce_rate: {
        percentage: parseFloat(coalesceRate.toFixed(2)),
        total: this.metrics.statusUpdateEventsTotal,
        coalesced: this.metrics.statusUpdateEventsCoalesced,
        individual: this.metrics.statusUpdateEventsTotal - this.metrics.statusUpdateEventsCoalesced,
        // Breakdown by messageId (how many updates each message received)
        updatesPerMessageId: Array.from(this.metrics.statusUpdateEventsByMessageId.entries()).map(([id, count]) => ({
          messageId: id,
          updateCount: count,
          wasCoalesced: count > 1,
        })),
      },
      buffer_hit_rate: {
        percentage: parseFloat(bufferHitRate.toFixed(2)),
        buffered: this.metrics.bufferHits,
        immediate: this.metrics.immediateDispatches,
        total: totalDispatched,
      },
      dedup_rate: {
        percentage: parseFloat(dedupRate.toFixed(2)),
        duplicates: this.metrics.duplicateEvents,
        total: this.metrics.totalEvents,
      },
      late_delivery_count: this.metrics.lateDeliveryCount,
      mismatched_surfaces: this.metrics.mismatchedSurfaces,
      lastDispatchTime: this.metrics.lastDispatchTime,
      bufferDelay: BUFFER_DELAY_MS,
      bufferSize: this.buffer.length,
    };
  }

  /**
   * Force flush buffer (for testing or manual trigger)
   */
  public forceFlush(): void {
    if (this.dispatchTimer) {
      clearTimeout(this.dispatchTimer);
      this.dispatchTimer = null;
    }
    this.flush();
  }

  /**
   * Clear buffer and reset metrics
   */
  public reset(): void {
    if (this.dispatchTimer) {
      clearTimeout(this.dispatchTimer);
      this.dispatchTimer = null;
    }
    this.buffer = [];
    this.eventSignatures.clear();
    this.metrics = {
      totalEvents: 0,
      duplicateEvents: 0,
      duplicateToastsCount: 0,
      highPriorityEvents: 0,
      dispatchLatencies: [],
      lastDispatchTime: 0,
      mismatchedSurfaces: 0,
      surfaceUpdateTimestamps: new Map(),
      statusUpdateEventsTotal: 0,
      statusUpdateEventsCoalesced: 0,
      statusUpdateEventsByMessageId: new Map(),
      bufferHits: 0,
      immediateDispatches: 0,
      lateDeliveryCount: 0,
      bufferStartTime: 0,
    };
  }
}

// Singleton instance
export const notificationDispatcher = new NotificationDispatcher();

// Expose buffer delay for debugging
if (typeof window !== 'undefined') {
  (window as any).__notificationDispatcher = notificationDispatcher;
  (window as any).__BUFFER_DELAY_MS = BUFFER_DELAY_MS;
}

