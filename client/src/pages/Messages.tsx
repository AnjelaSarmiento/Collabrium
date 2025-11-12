import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getProfileImageUrl } from '../utils/image';
import useChatSounds from '../hooks/useChatSounds';
import { useNotificationDispatcher, useDispatchedUpdates } from '../contexts/NotificationDispatcherContext';
import { DispatchedUpdate } from '../services/NotificationDispatcher';
import {
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  EllipsisHorizontalIcon,
  XMarkIcon,
  BellSlashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import UserStatusBadge from '../components/UserStatusBadge';
import TypingIndicator from '../components/TypingIndicator';
import ChatHeader from '../components/ChatHeader';
import MessageList from '../components/MessageList';
import MuteDurationModal from '../components/MuteDurationModal';

interface Toast {
  id: string;
  conversationId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
}

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  content: string;
  attachments: any[];
  seenBy: string[];
  deliveredTo?: Array<{
    userId: string;
    deliveredAt: string;
  }>;
  createdAt: string;
}

interface Conversation {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    profilePicture?: string;
  }>;
  lastMessage?: Message;
  lastMessageAt: string;
  unreadCount: number;
  isMuted?: boolean;
  mutedUntil?: string | null; // ISO date string or null for permanent mute
  otherParticipant?: {
    _id: string;
    name: string;
    profilePicture?: string;
  };
  // Room-specific fields
  isRoom?: boolean;
  roomId?: string;
  roomName?: string;
  roomStatus?: 'Active' | 'Completed' | 'Cancelled';
  isRoomParticipant?: boolean;
}

declare global {
  interface Window {
    __activeConversationId?: string;
  }
}

const Messages: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket, isConnected, joinConversation, leaveConversation, onMessageNew, onMessageSent, onMessageDelivered, onConversationUpdate, onTyping, sendTyping, onMessageSeen, ackMessageReceived, onUserStatusUpdate } = useSocket();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Use uncontrolled input with ref to prevent re-renders on keystroke
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [messageInput, setMessageInput] = useState(''); // Keep for form submission only
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sending, setSending] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [otherTypingName, setOtherTypingName] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((message: string, options: { conversationId?: string; senderName?: string; senderAvatar?: string } = {}) => {
    setToasts(prev => [
      ...prev,
      {
        id: `toast-${Date.now()}-${Math.random()}`,
        conversationId: options.conversationId ?? '',
        senderName: options.senderName ?? 'System',
        senderAvatar: options.senderAvatar,
        message,
      },
    ]);
  }, [setToasts]);
  const [stickyTimes, setStickyTimes] = useState<Set<string>>(new Set());
  const [messageStatus, setMessageStatus] = useState<Record<string, string>>({});
  // Rendered status state - only updates after buffer delay to prevent visual jumps
  const [renderedStatus, setRenderedStatus] = useState<Record<string, string>>({});
  // Track which read messages should show "Read" text (internal until clicked)
  const [readVisible, setReadVisible] = useState<Set<string>>(new Set()); // messageId -> isReadVisible
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchingConvosRef = useRef(false);
  const lastConvosFetchRef = useRef(0);
  const selectedConversationIdRef = useRef<string | null>(null);
  const isMessagesMountedRef = useRef<boolean>(false);
  const lastTypingEmitRef = useRef<number>(0);
  const isTypingActiveRef = useRef<boolean>(false); // Track if we've sent typing:start
  const typingThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Metrics tracking
  const typingMetricsRef = useRef<{
    emitCount: number;
    lastEmitTime: number;
    broadcastLatencies: number[];
    inputFrameTimes: number[];
    renderCount: number;
    lastRenderTime: number;
  }>({
    emitCount: 0,
    lastEmitTime: 0,
    broadcastLatencies: [],
    inputFrameTimes: [],
    renderCount: 0,
    lastRenderTime: 0
  });
  // Track message IDs that have already triggered the read sound
  const readSoundPlayedRef = useRef<Set<string>>(new Set());
  // Track message IDs that have already triggered the sent sound
  const sentSoundPlayedRef = useRef<Set<string>>(new Set());
  // Track if typing sound has been played for the current typing session (per conversation)
  // Key: conversationId, Value: boolean (true if sound already played for current typing session)
  const typingSoundPlayedRef = useRef<Map<string, boolean>>(new Map());
  // Track previous typing state per conversation to detect transitions
  // Key: conversationId, Value: boolean (was typing in previous event)
  const previousTypingStateRef = useRef<Map<string, boolean>>(new Map());
  // Track the last known read state of our messages to detect NEW reads
  const lastKnownReadStateRef = useRef<Map<string, Set<string>>>(new Map()); // messageId -> Set of user IDs who read it
  // Track pending read indicator timers to allow cancellation
  const pendingReadTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // messageId -> timeout ID
  // Track sequence numbers for status events to ignore older events
  const messageSeqRef = useRef<Map<string, number>>(new Map()); // messageId -> last processed seq
  const messageSeqNodeRef = useRef<Map<string, string>>(new Map()); // messageId -> last processed nodeId for tie-breaking
  // Track messages that have been sent (to prevent "In progress..." from showing after send)
  const sentMessagesRef = useRef<Set<string>>(new Set()); // messageId -> isSent
  // Track pending status render timers to buffer status updates
  const pendingStatusRenderTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // messageId -> timeout ID
  // Track latest buffered status for each message (to show only final state)
  const bufferedStatusRef = useRef<Map<string, string>>(new Map()); // messageId -> latest status
  // CRITICAL: Track highest status for each message to prevent backward transitions
  // This ref is updated synchronously whenever status changes, allowing progressTimer to check it
  const highestStatusRef = useRef<Map<string, string>>(new Map()); // messageId -> highest status
  // Track status glitches (backward transition attempts) for metrics
  const statusGlitchCountRef = useRef<Map<string, number>>(new Map()); // messageId -> glitch count
  
  // Config: Delay before showing read indicator visually (ms)
  // NOTE: Sound plays IMMEDIATELY after status update - no delay
  // This delay only affects the visual display of the read indicator
  const READ_INDICATOR_DELAY_MS = 400;
  // Config: Buffer delay for status rendering to prevent visual jumps (ms)
  // Only show the latest status after this delay, skipping intermediate transitions
  // Reduced to 100ms to match unified dispatcher buffer for faster Sent → Delivered transitions
  const STATUS_RENDER_BUFFER_MS = 100; // Configurable: 100-150ms range (reduced for faster UX)
  // Config: Threshold for showing "In progress..." status (ms)
  // Only show "In progress..." if message upload takes longer than this
  // If message uploads quickly, skip this status entirely
  const IN_PROGRESS_THRESHOLD_MS = 300;
  // Use dispatcher's buffer delay (default 150ms, configurable)
  // The unified dispatcher handles buffering and coalescing for all status updates
  const dispatcher = useNotificationDispatcher();

  // Chat sounds hook - enable sounds by default
  const { playMessageSent, playMessageReceived, playTyping, playMessageRead, primeReadSound, setupAudioUnlock } = useChatSounds({
    enabled: true,
    volume: 0.6
  });
  
  // Setup audio unlock and prime read sound on mount (background task)
  useEffect(() => {
    // Move audio setup to background to avoid blocking initial render
    setTimeout(() => {
      setupAudioUnlock();
      // Prime read sound when app loads to ensure it's ready for immediate playback
      primeReadSound();
      console.log('[Messages] ✅ Primed read sound on app load (background)');
    }, 0);
  }, [setupAudioUnlock, primeReadSound]);

  // Log typing metrics periodically (every 30 seconds)
  useEffect(() => {
    const metricsInterval = setInterval(() => {
      const metrics = typingMetricsRef.current;
      if (metrics.emitCount > 0 || metrics.broadcastLatencies.length > 0 || metrics.inputFrameTimes.length > 0) {
        const avgInputFrameTime = metrics.inputFrameTimes.length > 0
          ? metrics.inputFrameTimes.reduce((a, b) => a + b, 0) / metrics.inputFrameTimes.length
          : 0;
        const avgBroadcastLatency = metrics.broadcastLatencies.length > 0
          ? metrics.broadcastLatencies.reduce((a, b) => a + b, 0) / metrics.broadcastLatencies.length
          : 0;
        const timeWindow = metrics.lastEmitTime > 0 ? (Date.now() - metrics.lastEmitTime) / 1000 : 1;
        const emitRate = metrics.emitCount > 0 && timeWindow > 0
          ? metrics.emitCount / timeWindow
          : 0;
        
        console.log('[Messages] 📊 Typing Metrics:', {
          typing_event_emit_rate: emitRate.toFixed(2) + ' events/sec',
          typing_broadcast_latency: avgBroadcastLatency > 0 ? avgBroadcastLatency.toFixed(2) + 'ms' : 'N/A',
          input_frame_time: avgInputFrameTime > 0 ? avgInputFrameTime.toFixed(2) + 'ms' : 'N/A',
          re_renders_per_keystroke: metrics.renderCount,
          total_emits: metrics.emitCount,
          total_broadcasts_received: metrics.broadcastLatencies.length
        });
      }
    }, 30000); // Log every 30 seconds
    
    return () => clearInterval(metricsInterval);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [user]);

  // If navigated with ?open=<conversationId>, auto-select
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || conversations.length === 0) return;
    const target = conversations.find(c => c._id === openId);
    if (target) setSelectedConversation(target);
  }, [searchParams, conversations]);

  useEffect(() => {
    if (selectedConversation) {
      const prevConvId = selectedConversationIdRef.current; // Store previous conversation ID before updating
      selectedConversationIdRef.current = selectedConversation._id;
      window.__activeConversationId = selectedConversation._id;
      // reset typing indicator on convo switch
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingStopTimeoutRef.current) {
        clearTimeout(typingStopTimeoutRef.current);
        typingStopTimeoutRef.current = null;
      }
      if (typingThrottleTimerRef.current) {
        clearTimeout(typingThrottleTimerRef.current);
        typingThrottleTimerRef.current = null;
      }
      // Send typing:stop when switching conversations (if we were typing in previous conversation)
      if (isTypingActiveRef.current && prevConvId && sendTyping && isConnected) {
        isTypingActiveRef.current = false;
        sendTyping(prevConvId, false);
      }
      setIsOtherTyping(false);
      fetchMessages(selectedConversation._id);
      if (isConnected && socket) {
        joinConversation(selectedConversation._id);
      }
      markAsRead(selectedConversation._id);
      
      // CRITICAL: Prime read sound when conversation opens to reduce latency
      // This ensures audio is ready for immediate playback when read events arrive
      primeReadSound();
      console.log(`[Messages] ✅ Primed read sound for conversation: ${selectedConversation._id}`);
      
      // Initialize read state tracking when opening conversation
      // This prevents playing read sound when we open the conversation ourselves

      return () => {
        leaveConversation(selectedConversation._id);
        delete window.__activeConversationId;
        // Cancel all pending read indicator timers when switching conversations
        pendingReadTimersRef.current.forEach((timerId) => {
          clearTimeout(timerId);
        });
        pendingReadTimersRef.current.clear();
        // Cancel all pending status render timers when switching conversations
        pendingStatusRenderTimersRef.current.forEach((timerId) => {
          clearTimeout(timerId);
        });
        pendingStatusRenderTimersRef.current.clear();
        bufferedStatusRef.current.clear();
        // Clear sequence tracking when switching conversations
        messageSeqRef.current.clear();
        sentMessagesRef.current.clear();
        // Note: We don't clear readSoundPlayedRef or lastKnownReadStateRef here
        // because we want to remember which messages already played the sound
        // even if we switch conversations
      };
    } else {
      selectedConversationIdRef.current = null;
      delete window.__activeConversationId;
      setIsOtherTyping(false);
    }
  }, [selectedConversation, isConnected, socket, joinConversation, leaveConversation]);

  useEffect(() => {
    return () => {
      delete window.__activeConversationId;
    };
  }, []);

  // Message highlighting removed for performance - messages just redirect without visual highlight

  // Rejoin conversation room when socket reconnects
  useEffect(() => {
    if (selectedConversation && isConnected && socket) {
      joinConversation(selectedConversation._id);
    }
  }, [isConnected, socket, selectedConversation, joinConversation]);

  const handleSelectConversation = React.useCallback((conv: Conversation) => {
    // For room conversations, navigate to the room instead of opening chat
    if (conv.isRoom && conv.roomId) {
      navigate(`/app/room/${conv.roomId}`);
      return;
    }
    
    if (!selectedConversation || selectedConversation._id !== conv._id) {
      setSelectedConversation(conv);
    } else {
      // If clicking the same item, still ensure messages are loaded/refreshed
      fetchMessages(conv._id);
      markAsRead(conv._id);
    }
  }, [selectedConversation, navigate]);

  useEffect(() => {
    // Instant scroll to bottom when new messages arrive (no smooth animation to avoid lag)
    // Use requestAnimationFrame to defer scroll and prevent blocking UI
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    }
  }, [messages.length]);

  useEffect(() => {
    // Mark component mounted for visibility gating
    isMessagesMountedRef.current = true;
    // Listen for new messages
    const handleNewMessage = (data: { conversationId: string; message: Message }) => {
      try {
        // Validate payload
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid message:new payload: payload is not an object');
        }
        if (!data.conversationId || typeof data.conversationId !== 'string') {
          throw new Error('Invalid message:new payload: missing or invalid conversationId');
        }
        if (!data.message || typeof data.message !== 'object') {
          throw new Error('Invalid message:new payload: missing or invalid message');
        }
        if (!data.message.sender || typeof data.message.sender !== 'object') {
          throw new Error('Invalid message:new payload: missing or invalid message.sender');
        }
        
        // Note: ACK is now handled globally in SocketContext, persisting across route changes
        // This ensures message status updates to "Delivered" even when recipient is on another page
        
        const isCurrentConversation = data.conversationId === selectedConversationIdRef.current;
        const isFromOtherUser = data.message.sender._id !== user?._id;
        const isViewingConversation = isCurrentConversation && 
                                       document.visibilityState === 'visible' && 
                                       window.__activeConversationId === data.conversationId;
      
      if (isCurrentConversation) {
        setMessages(prev => {
          if (prev.some(m => m._id === data.message._id)) return prev;
          return [...prev, data.message];
        });
        // Optimistically keep unread count at 0 for the open conversation and update last message info
        setConversations(prev => prev.map(c => {
          if (c._id !== data.conversationId) return c;
          return {
            ...c,
            lastMessage: data.message,
            lastMessageAt: data.message.createdAt,
            unreadCount: 0,
          };
        }));
        
        // Play message received sound if:
        // 1. Message is from another user (not self)
        // 2. User is viewing the conversation
        // 3. Tab is visible
        if (isFromOtherUser && isViewingConversation) {
          playMessageReceived().catch((err) => {
            const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
            console.warn('[Messages] playMessageReceived failed:', error);
          });
        }
        
        if (isMessagesMountedRef.current && document.visibilityState === 'visible' && selectedConversationIdRef.current) {
        markAsRead(data.conversationId);
        }
        // Note: "Delivered" status is only set via the message:delivered event, not here
        // Don't fetchConversations() here to avoid overriding optimistic unreadCount: 0
      } else {
        // CRITICAL: Skip local toast to prevent duplicates
        // Global toast system (NotificationBridge) handles all message notifications
        // Local toasts are disabled to prevent duplicate popups for the same message
        // The global toast system will show toasts for messages when user is not viewing the conversation
        
        // Route conversation count update through unified dispatcher for buffering
        // This ensures message counts update together with other notification surfaces
        dispatcher.dispatch({
          type: 'message:count_update',
          payload: {
            conversationId: data.conversationId,
            increment: 1,
            message: data.message,
            lastMessageAt: data.message.createdAt,
          },
          timestamp: Date.now(),
          source: 'messages:handleNewMessage',
        });
        
        // Refresh conversations list from server for OTHER conversations only
        // This will update lastMessage and other metadata, but unreadCount will be updated via dispatcher
        fetchConversations();
      }
      } catch (err) {
        // Only throw Error instances
        const error = err instanceof Error ? err : new Error(`message:new handler error: ${String(err)}`);
        console.error('[Messages] message:new handler error', error);
        // Don't re-throw - log and continue
      }
    };

    // Listen for conversation updates
    const handleConversationUpdate = () => {
      try {
        fetchConversations();
      } catch (err) {
        // Only throw Error instances
        const error = err instanceof Error ? err : new Error(`conversation:update handler error: ${String(err)}`);
        console.error('[Messages] conversation:update handler error', error);
        // Don't re-throw - log and continue
      }
    };

    onMessageNew(handleNewMessage);
    onConversationUpdate(handleConversationUpdate);

    // Delivery receipts -> set status to Delivered
    // Update status for ALL conversations, not just the current one
    // Handle message:sent event from server
    // This is emitted immediately after message is created, BEFORE delivery
    // CRITICAL: Play sent sound ONLY here, based on status transition to "Sent"
    onMessageSent((payload: { conversationId: string; messageId: string; seq?: number; timestamp?: string; nodeId?: string }) => {
      try {
        // Validate payload
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid message:sent payload: payload is not an object');
        }
        if (!payload.messageId || typeof payload.messageId !== 'string') {
          throw new Error('Invalid message:sent payload: missing or invalid messageId');
        }
        if (!payload.conversationId || typeof payload.conversationId !== 'string') {
          throw new Error('Invalid message:sent payload: missing or invalid conversationId');
        }
        
        const timestamp = new Date().toISOString();
        const messageId = payload.messageId;
        const eventSeq = payload.seq ?? 1; // Default to 1 if not provided (backward compatibility)
      
      // Check sequence number - ignore older events
      // Primary ordering: sequence number
      // Tie-breaker 1: timestamp (if seq equal)
      // Tie-breaker 2: node-id (if seq and timestamp equal) - for multi-instance reliability
      const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
      const lastTimestamp = messageSeqRef.current.get(`${messageId}_timestamp`) ?? 0;
      const lastNodeId = messageSeqNodeRef.current.get(messageId) ?? '';
      const eventTimestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
      const eventNodeId = payload.nodeId || '';
      
      // Check if event is older (strictly less sequence, or equal seq with older timestamp/node-id)
      const isOlderSeq = eventSeq < lastSeq;
      const isEqualSeqOlderTimestamp = eventSeq === lastSeq && eventTimestamp < lastTimestamp;
      const isEqualSeqEqualTimestampOlderNodeId = eventSeq === lastSeq && eventTimestamp === lastTimestamp && eventNodeId < lastNodeId;
      const isOlderEvent = isOlderSeq || isEqualSeqOlderTimestamp || isEqualSeqEqualTimestampOlderNodeId;
      
      if (isOlderEvent) {
        console.log(`[Messages] ⏭️ Ignoring older message:sent event (seq ${eventSeq} < ${lastSeq} or tie-breaker) for:`, messageId, {
          eventSeq,
          lastSeq,
          eventTimestamp: new Date(eventTimestamp).toISOString(),
          lastTimestamp: new Date(lastTimestamp).toISOString(),
          eventNodeId,
          lastNodeId
        });
        return;
      }
      // Only update if this is a newer or equal sequence (with tie-breakers)
      if (eventSeq >= lastSeq) {
        messageSeqRef.current.set(messageId, eventSeq);
        messageSeqRef.current.set(`${messageId}_timestamp`, eventTimestamp);
        if (eventNodeId) {
          messageSeqNodeRef.current.set(messageId, eventNodeId);
        }
      }
      
      const deviceId = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
      console.log(`[Messages] 📨 message:sent event received at ${timestamp}:`, {
        messageId,
        conversationId: payload.conversationId,
        seq: eventSeq,
        eventTimestamp: payload.timestamp,
        nodeId: eventNodeId,
        deviceId: deviceId.substring(0, 100) // Truncate for readability
      });
      
      // CRITICAL: Check if sound should play BEFORE any status updates
      // This ensures we capture the true previous status before any async operations
      const prevStatus = messageStatus[messageId] || 'In progress...';
      const soundNotPlayed = !sentSoundPlayedRef.current.has(messageId);
      
      // CRITICAL: Play sound ONLY on transition to "Sent" (not if already "Sent" or higher)
      // This guards against race conditions where delivered arrives first
      const isTransitionToSent = prevStatus !== 'Sent' && 
                                  prevStatus !== 'Delivered' && 
                                  prevStatus !== 'Read';
      
      // ENHANCED: Handle race condition where delivered arrives before sent
      // If status is already "Delivered" but sound hasn't been played, we should still play it
      // This ensures sound plays even if events arrive out of order
      const isDeliveredButSoundNotPlayed = prevStatus === 'Delivered' && soundNotPlayed;
      
      // Determine if we should play sound
      // CRITICAL: Play sound IMMEDIATELY if transitioning to Sent OR if delivered arrived first
      // Do NOT wait for status update - play sound based on current state
      const shouldPlaySound = (isTransitionToSent || isDeliveredButSoundNotPlayed) && soundNotPlayed;
      
      // Mark sound as played IMMEDIATELY if we're going to play it
      // This prevents any race conditions with fetchMessages() or other async operations
      if (shouldPlaySound) {
        sentSoundPlayedRef.current.add(payload.messageId);
      }
      
      // Route status update through unified dispatcher for buffering and coalescing
      dispatcher.dispatch({
        type: 'message:sent',
        payload: {
          conversationId: payload.conversationId,
          messageId,
          seq: eventSeq,
          timestamp: payload.timestamp,
        },
        timestamp: Date.now(),
        source: 'messages:onMessageSent',
      });
      
      console.log('[Messages] Status transition check:', {
        messageId: messageId,
        prevStatus,
        newStatus: 'Sent',
        isTransitionToSent,
        isDeliveredButSoundNotPlayed,
        soundNotPlayed,
        shouldPlaySound,
        timestamp
      });
      
      // Play message sent sound IMMEDIATELY if conditions are met
      // CRITICAL: Play sound BEFORE any async operations (like fetchMessages) can interfere
      // This ensures sound plays on "Sent" regardless of recipient online state
      if (shouldPlaySound) {
        // Play message sent sound ONLY when:
        // 1. Status is transitioning TO "Sent" (normal case), OR
        // 2. Status is already "Delivered" but sound hasn't been played (race condition)
        // 3. User is viewing the conversation
        // 4. Tab is visible
        if (payload.conversationId === selectedConversationIdRef.current &&
            document.visibilityState === 'visible' &&
            window.__activeConversationId === payload.conversationId) {
          // Play sound asynchronously (non-blocking)
          // Move logging to async to avoid blocking input
          const scheduleAsync = typeof requestIdleCallback !== 'undefined' 
            ? (cb: () => void) => requestIdleCallback(cb, { timeout: 100 })
            : (cb: () => void) => setTimeout(cb, 0);
          
          scheduleAsync(() => {
          const transitionType = isDeliveredButSoundNotPlayed 
            ? 'race condition (Delivered → Sent)' 
            : `${prevStatus} → Sent`;
          console.log(`[Messages] 🔊 Playing sent sound (status transition: ${transitionType}) at ${timestamp}:`, messageId);
          console.log(`[Messages] ✅ Sound marked as played IMMEDIATELY to prevent replay`);
          });
          
          // Play sound asynchronously (non-blocking)
          playMessageSent().catch((err) => {
            const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
            console.warn('[Messages] playMessageSent failed:', error);
          });
        } else {
          console.log('[Messages] ⚠️ Sent sound NOT played (conditions not met):', {
            messageId: messageId,
            shouldPlaySound,
            isCurrentConversation: payload.conversationId === selectedConversationIdRef.current,
            isTabVisible: document.visibilityState === 'visible',
            activeConversationId: window.__activeConversationId
          });
        }
      } else if (!shouldPlaySound && !soundNotPlayed) {
        console.log('[Messages] ⚠️ Skipping sent sound - already played:', {
          messageId: payload.messageId,
          prevStatus
        });
      } else if (!shouldPlaySound && prevStatus === 'Sent') {
        console.log('[Messages] ⚠️ Skipping sent sound - already Sent:', {
          messageId: payload.messageId,
          prevStatus
        });
      } else if (!shouldPlaySound && prevStatus === 'Delivered' && soundNotPlayed) {
        // This shouldn't happen, but log it for debugging
        console.log('[Messages] ⚠️ Skipping sent sound - status is Delivered but conditions not met:', {
          messageId: payload.messageId,
          prevStatus,
          isDeliveredButSoundNotPlayed,
          isTransitionToSent
        });
      }
      } catch (err) {
        // Only throw Error instances
        const error = err instanceof Error ? err : new Error(`message:sent handler error: ${String(err)}`);
        console.error('[Messages] message:sent handler error', error);
        // Don't re-throw - log and continue
      }
    });

      // Handle message:delivered event from server
      // CRITICAL: Do NOT play sent sound here - it should ONLY play on transition to "Sent" in message:sent handler
      onMessageDelivered((payload: { conversationId: string; messageId: string; seq?: number; timestamp?: string; nodeId?: string }) => {
        try {
          // Validate payload (additional validation beyond SocketContext)
          if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid message:delivered payload: payload is not an object');
          }
          if (!payload.messageId || typeof payload.messageId !== 'string') {
            throw new Error('Invalid message:delivered payload: missing or invalid messageId');
          }
          if (!payload.conversationId || typeof payload.conversationId !== 'string') {
            throw new Error('Invalid message:delivered payload: missing or invalid conversationId');
          }
          
          const timestamp = new Date().toISOString();
          const messageId = payload.messageId;
          const eventSeq = payload.seq ?? 2; // Default to 2 if not provided (backward compatibility)
        
        // Check sequence number - ignore older events
        // Primary ordering: sequence number
        // Tie-breaker 1: timestamp (if seq equal)
        // Tie-breaker 2: node-id (if seq and timestamp equal) - for multi-instance reliability
        const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
        const lastTimestamp = messageSeqRef.current.get(`${messageId}_timestamp`) ?? 0;
        const lastNodeId = messageSeqNodeRef.current.get(messageId) ?? '';
        const eventTimestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
        const eventNodeId = payload.nodeId || '';
        
        // Check if event is older (strictly less sequence, or equal seq with older timestamp/node-id)
        const isOlderSeq = eventSeq < lastSeq;
        const isEqualSeqOlderTimestamp = eventSeq === lastSeq && eventTimestamp < lastTimestamp;
        const isEqualSeqEqualTimestampOlderNodeId = eventSeq === lastSeq && eventTimestamp === lastTimestamp && eventNodeId < lastNodeId;
        const isOlderEvent = isOlderSeq || isEqualSeqOlderTimestamp || isEqualSeqEqualTimestampOlderNodeId;
        
        if (isOlderEvent) {
          console.log(`[Messages] ⏭️ Ignoring older message:delivered event (seq ${eventSeq} < ${lastSeq} or tie-breaker) for:`, messageId, {
            eventSeq,
            lastSeq,
            eventTimestamp: new Date(eventTimestamp).toISOString(),
            lastTimestamp: new Date(lastTimestamp).toISOString(),
            eventNodeId,
            lastNodeId
          });
          return;
        }
        // Only update if this is a newer or equal sequence (with tie-breakers)
        if (eventSeq >= lastSeq) {
          messageSeqRef.current.set(messageId, eventSeq);
        messageSeqRef.current.set(`${messageId}_timestamp`, eventTimestamp);
        if (eventNodeId) {
          messageSeqNodeRef.current.set(messageId, eventNodeId);
        }
      }
      
        const deviceId = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
        console.log(`[Messages] 📬 message:delivered event received at ${timestamp}:`, {
          messageId,
          conversationId: payload.conversationId,
          seq: eventSeq,
          eventTimestamp: payload.timestamp,
          nodeId: eventNodeId,
          deviceId: deviceId.substring(0, 100) // Truncate for readability
        });
        
        // Get previous status BEFORE updating
        const prevStatus = messageStatus[messageId] || 'Sent';
        
        // Route status update through unified dispatcher for buffering and coalescing
        if (lastSeq === 0 || lastSeq === 1 || eventSeq >= lastSeq) {
          dispatcher.dispatch({
            type: 'message:delivered',
            payload: {
              conversationId: payload.conversationId,
              messageId,
              seq: eventSeq,
              timestamp: payload.timestamp,
            },
            timestamp: Date.now(),
            source: 'messages:onMessageDelivered',
          });
        } else {
          console.log(`[Messages] ⚠️ Skipping "Delivered" - sequence out of order (lastSeq: ${lastSeq}, eventSeq: ${eventSeq}) for:`, messageId);
          return;
        }
      
      console.log('[Messages] Status transition:', {
        messageId: messageId,
        prevStatus,
        newStatus: 'Delivered',
        timestamp,
        soundPlayed: sentSoundPlayedRef.current.has(messageId)
      });
      
        // CRITICAL: Do NOT mark sound as played here - only mark when actually playing in message:sent handler
        // However, if delivered arrives BEFORE sent (race condition), we should not play sound on delivered
        // The sound should only play when status transitions TO "Sent", which happens in message:sent handler
        if (!sentSoundPlayedRef.current.has(messageId)) {
          console.log('[Messages] ⚠️ WARNING: message:delivered arrived before message:sent for:', messageId);
        console.log('[Messages] ⚠️ Sound will NOT play on delivered - it will only play when message:sent arrives and transitions to "Sent"');
      }
      
      // If this is the current conversation, also refresh messages to ensure UI is fully synced
      // This is especially important for offline-to-online delivery
      // CRITICAL: Delay fetchMessages to ensure message:sent handler has time to play sound first
      // This prevents fetchMessages from interfering with sound playback timing
      if (payload.conversationId === selectedConversationIdRef.current) {
        // Increased delay to ensure message:sent handler completes before fetchMessages runs
        // This prevents race conditions where fetchMessages updates status before sound plays
        setTimeout(() => {
          if (selectedConversationIdRef.current === payload.conversationId) {
            fetchMessages(payload.conversationId);
          }
        }, 200); // Increased from 100ms to 200ms to give message:sent handler time to complete
      }
      
      // Only refetch conversations if not the current conversation to avoid overriding unread count
      if (payload.conversationId !== selectedConversationIdRef.current) {
        fetchConversations();
      }
      } catch (err) {
        // Only throw Error instances
        const error = err instanceof Error ? err : new Error(`message:delivered handler error: ${String(err)}`);
        console.error('[Messages] message:delivered handler error', error);
        // Don't re-throw - log and continue
      }
    });
    
    // Listen for when recipient comes online to trigger offline-to-online delivery updates
    onUserStatusUpdate((data: { userId: string; status: string }) => {
      try {
        // Validate payload (additional validation beyond SocketContext)
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid user-status-update payload: payload is not an object');
        }
        if (!data.userId || typeof data.userId !== 'string') {
          throw new Error('Invalid user-status-update payload: missing or invalid userId');
        }
        if (!data.status || typeof data.status !== 'string') {
          throw new Error('Invalid user-status-update payload: missing or invalid status');
        }
        
        // If the recipient comes online, check ALL conversations where they're a participant
        if (data.status === 'online') {
        // Find all conversations involving this user
        const relevantConvs = conversations.filter(c => {
          const otherId = c.otherParticipant?._id || 
            c.participants.find(p => p._id !== user?._id)?._id;
          return otherId === data.userId;
        });
        
        // For each relevant conversation, refresh messages to sync delivery status from server
        // The server will emit message:delivered events, but we also fetch to ensure consistency
        relevantConvs.forEach(conv => {
          if (conv._id === selectedConversationIdRef.current) {
            // Refresh messages for current conversation to sync delivery status
            // Use a small delay to let server process offline-to-online delivery
            setTimeout(() => {
              if (selectedConversationIdRef.current === conv._id) {
                fetchMessages(conv._id);
              }
            }, 800); // Increased delay to ensure server has processed and emitted events
          }
        });
        
        // Refresh conversations list to update unread counts, but preserve optimistic updates
        setTimeout(() => {
          fetchConversations();
        }, 900);
      }
      } catch (err) {
        // Only throw Error instances
        const error = err instanceof Error ? err : new Error(`user-status-update handler error: ${String(err)}`);
        console.error('[Messages] user-status-update handler error', error);
        // Don't re-throw - log and continue
      }
    });
    // Real-time read receipts: update messages immediately when the other user reads
    // CRITICAL: This handler processes read events for ALL conversations, not just the currently open one
    // This ensures the sender hears the read sound even if they're viewing a different conversation
    onMessageSeen(async (payload: { conversationId: string; userId: string; seq?: number; timestamp?: string; nodeId?: string }) => {
      try {
        // Validate payload (additional validation beyond SocketContext)
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid message:seen payload: payload is not an object');
        }
        if (!payload.userId || typeof payload.userId !== 'string') {
          throw new Error('Invalid message:seen payload: missing or invalid userId');
        }
        if (!payload.conversationId || typeof payload.conversationId !== 'string') {
          throw new Error('Invalid message:seen payload: missing or invalid conversationId');
        }
        
        const timestamp = new Date().toISOString();
        const eventSeq = payload.seq ?? 3; // Default to 3 if not provided (backward compatibility)
        console.log(`[Messages] 📖 message:seen event received at ${timestamp}:`, {
          ...payload,
          seq: eventSeq,
          eventTimestamp: payload.timestamp
        });
      
      const isCurrentConversation = payload.conversationId === selectedConversationIdRef.current;
      const isViewingConversation = isCurrentConversation && 
                                     document.visibilityState === 'visible' && 
                                     window.__activeConversationId === payload.conversationId;
      
      // Normalize user IDs for comparison
      const currentUserIdStr = user?._id?.toString() || String(user?._id || '');
      const payloadUserIdStr = payload.userId?.toString() || String(payload.userId || '');
      
      // Don't play sound if we're the ones marking messages as read (when we open the conversation)
      const isOurOwnRead = currentUserIdStr === payloadUserIdStr || 
                           payloadUserIdStr === currentUserIdStr ||
                           payload.userId === user?._id ||
                           payload.userId?.toString() === user?._id?.toString();
      
      console.log('[Messages] Read sound check:', {
        isCurrentConversation,
        isViewingConversation,
        isOurOwnRead,
        currentUserId: currentUserIdStr,
        payloadUserId: payloadUserIdStr,
        conversationId: payload.conversationId,
        selectedConversationId: selectedConversationIdRef.current,
        timestamp
      });
      
      // CRITICAL: The payload.userId is the person who read the message (the recipient)
      // Since we are the sender, payload.userId is the other participant in the conversation
      // This is the person who read our messages
      const resolvedOtherParticipantIdStr = payloadUserIdStr;
      
      // Get the conversation for UI updates (if currently open)
        const currentConv = conversations.find(c => c._id === payload.conversationId);
      
      // CRITICAL: Always fetch messages to check which of our messages were read
      // This works for both currently open conversations and conversations not currently open
      // This ensures we detect read events even if the conversation is not currently open
      try {
        const response = await axios.get(`/messages/conversations/${payload.conversationId}/messages`);
        if (response.data.success) {
          const fetchedMessages: Message[] = response.data.messages;
          
          // Track which messages are newly read (messages we sent that are now read)
          const newlyReadMessages: string[] = [];
          
          // Process fetched messages to find newly read messages
          fetchedMessages.forEach(msg => {
              const msgSenderId = msg.sender._id?.toString() || String(msg.sender._id || '');
              const isOurMessage = msgSenderId === currentUserIdStr;
              
            if (!isOurMessage || !resolvedOtherParticipantIdStr) return;
              
            // Check if message is read by the other participant
            const isActuallyRead = msg.seenBy && Array.isArray(msg.seenBy) && msg.seenBy.some((id: any) => {
                let idStr: string;
                if (typeof id === 'string') {
                  idStr = id;
                } else if (id && typeof id === 'object' && 'toString' in id) {
                  idStr = id.toString();
                } else {
                  idStr = String(id);
                }
              return idStr === resolvedOtherParticipantIdStr;
              });
              
            if (!isActuallyRead) return;
            
            // Check previous read state to determine if this is a NEW read
              const previousReadBy = lastKnownReadStateRef.current.get(msg._id) || new Set<string>();
            const wasPreviouslyRead = previousReadBy.has(resolvedOtherParticipantIdStr);
            const isNewReadEvent = !wasPreviouslyRead;
              
              // Check if sound has already been played for this message
              const soundAlreadyPlayed = readSoundPlayedRef.current.has(msg._id);
              
            // Update read state tracking
                const updatedReadBy = new Set(previousReadBy);
            updatedReadBy.add(resolvedOtherParticipantIdStr);
                lastKnownReadStateRef.current.set(msg._id, updatedReadBy);
                
            // If this is a new read event and sound hasn't been played, add to newlyReadMessages
            if (isNewReadEvent && !soundAlreadyPlayed) {
              newlyReadMessages.push(msg._id);
              console.log(`[Messages] ✅ NEW read detected for message: ${msg._id} at ${timestamp} (conversation: ${payload.conversationId})`);
            }
          });
          
          // Update messages state if this is the current conversation
          if (isCurrentConversation) {
            setMessages(fetchedMessages);
          }
          
          // CRITICAL: Play sound for newly read messages if:
          // 1. We have newly read messages
          // 2. It's not our own read action
          // 3. Tab is visible (don't play when tab is hidden)
          // 4. We have the other participant ID
          // 5. The sender currently has that conversation open (isCurrentConversation)
          const shouldPlayReadSound = newlyReadMessages.length > 0 && 
                                       !isOurOwnRead && 
                                       document.visibilityState === 'visible' &&
                                       resolvedOtherParticipantIdStr !== '' &&
                                       isCurrentConversation; // CRITICAL: Only play if conversation is open
          
          console.log('[Messages] Read sound decision:', {
            shouldPlayReadSound,
            newlyReadMessagesCount: newlyReadMessages.length,
            isOurOwnRead,
            isTabVisible: document.visibilityState === 'visible',
            conversationId: payload.conversationId,
            isCurrentConversation,
            resolvedOtherParticipantIdStr
          });
          
          if (shouldPlayReadSound) {
            // Process each newly read message
            newlyReadMessages.forEach(msgId => {
              // CRITICAL: Check if sound has already been played for this message BEFORE processing
              // This prevents duplicate plays if the same message is processed multiple times
              if (readSoundPlayedRef.current.has(msgId)) {
                console.log(`[Messages] ⏭️ Skipping read sound - already played for message: ${msgId}`);
                return;
              }
              
              // CRITICAL: Mark sound as played IMMEDIATELY to prevent duplicate plays
              // Do this BEFORE updating status to ensure we don't play sound twice
              readSoundPlayedRef.current.add(msgId);
              
              // CRITICAL: Update Read status IMMEDIATELY - bypass all buffers
              // Read events are final and authoritative - no artificial latency, no debouncing
              const readSeq = eventSeq; // Use eventSeq from payload (seq: 3)
              const lastSeq = messageSeqRef.current.get(msgId) ?? 0;
              const lastTimestamp = messageSeqRef.current.get(`${msgId}_timestamp`) ?? 0;
              const lastNodeId = messageSeqNodeRef.current.get(msgId) ?? '';
              const eventTimestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
              const eventNodeId = payload.nodeId || '';
              
              // Check sequence number - ignore older events
              // Primary ordering: sequence number
              // Tie-breaker 1: timestamp (if seq equal)
              // Tie-breaker 2: node-id (if seq and timestamp equal) - for multi-instance reliability
              const isOlderSeq = readSeq < lastSeq;
              const isEqualSeqOlderTimestamp = readSeq === lastSeq && eventTimestamp < lastTimestamp;
              const isEqualSeqEqualTimestampOlderNodeId = readSeq === lastSeq && eventTimestamp === lastTimestamp && eventNodeId < lastNodeId;
              const isOlderEvent = isOlderSeq || isEqualSeqOlderTimestamp || isEqualSeqEqualTimestampOlderNodeId;
              
              if (isOlderEvent) {
                console.log(`[Messages] ⏭️ Ignoring older message:seen event (seq ${readSeq} < ${lastSeq} or tie-breaker) for:`, msgId, {
                  messageId: msgId,
                  statusSeq: readSeq,
                  lastSeq: lastSeq,
                  eventTimestamp: new Date(eventTimestamp).toISOString(),
                  lastTimestamp: new Date(lastTimestamp).toISOString(),
                  eventNodeId,
                  lastNodeId,
                  readerId: resolvedOtherParticipantIdStr,
                  conversationId: payload.conversationId,
                  serverTimestamp: payload.timestamp ?? null,
                  clientReceiptTimestamp: new Date().toISOString()
                });
                return;
              }
              
              // Only process if this is a valid sequence (readSeq >= lastSeq with tie-breakers)
              if (readSeq >= lastSeq) {
                // Update sequence tracking immediately
                messageSeqRef.current.set(msgId, readSeq);
                messageSeqRef.current.set(`${msgId}_timestamp`, eventTimestamp);
                if (eventNodeId) {
                  messageSeqNodeRef.current.set(msgId, eventNodeId);
                }
              }
              
              const deviceId = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
              const serverTimestampMs = payload.timestamp ? new Date(payload.timestamp).getTime() : undefined;
              const readSoundLatencyMs = typeof serverTimestampMs === 'number' ? Date.now() - serverTimestampMs : null;
              console.log(`[Messages] 🔊 Playing read sound IMMEDIATELY after status update for message: ${msgId}`, {
                messageId: msgId,
                conversationId: payload.conversationId,
                isCurrentConversation,
                isOurOwnRead,
                newlyRead: newlyReadMessages,
                serverTimestamp: payload.timestamp ?? null,
                clientReceiveTimestamp: new Date().toISOString(),
                uiUpdateTimestamp: new Date().toISOString(),
                audioPlayCallTimestamp: new Date().toISOString(),
                readSoundLatency: readSoundLatencyMs
              });
              
              // Play sound with comprehensive metadata for logging
              // CRITICAL: Handle promise rejection to prevent unhandled rejection errors
              playMessageRead({
                serverTimestamp: payload.timestamp,
                clientReceiveTimestamp: new Date().toISOString(),
                uiUpdateTimestamp: new Date().toISOString(),
                messageId: msgId,
                conversationId: payload.conversationId
              })
                .then((result) => {
                  // Log successful playback with latency
                  try {
                    const totalLatency = result.playResolvedTimestamp && typeof serverTimestampMs === 'number'
                      ? new Date(result.playResolvedTimestamp).getTime() - serverTimestampMs
                      : null;
                    console.log(`[Messages] ✅ Read sound played successfully for message: ${msgId}`, {
                      messageId: msgId,
                      conversationId: payload.conversationId,
                      serverTimestamp: payload.timestamp ?? null,
                      clientReceiptTimestamp: new Date().toISOString(),
                      uiUpdateTimestamp: new Date().toISOString(),
                      audioPlayCallTimestamp: result.playCallTimestamp,
                      audioPlayResolvedTimestamp: result.playResolvedTimestamp,
                      readSoundLatency: totalLatency
                    });
                  } catch (logErr) {
                    // Silently handle logging errors
                    console.error(`[Messages] Error logging read sound success:`, logErr);
                  }
                })
                .catch((error) => {
                  // Log playback failure - safely handle error object
                  try {
                    const errorInfo = error && typeof error === 'object' 
                      ? {
                          playFailedTimestamp: error.playFailedTimestamp,
                          playbackLatency: error.latency,
                          error: error.error || error.message || String(error),
                          success: error.success
                        }
                      : { error: String(error) };
                    
                    console.error(`[Messages] ❌ Failed to play read sound for message: ${msgId}`, {
                      messageId: msgId,
                      conversationId: payload.conversationId,
                      serverTimestamp: payload.timestamp ?? null,
                      clientReceiptTimestamp: new Date().toISOString(),
                      uiUpdateTimestamp: new Date().toISOString(),
                      audioPlayCallTimestamp: new Date().toISOString(),
                      ...errorInfo
                    });
                  } catch (logErr) {
                    // Silently handle logging errors to prevent cascading failures
                    console.error(`[Messages] Error logging read sound failure:`, logErr);
                  }
                });
            });
          }
          
          // If this is the current conversation, also handle visual indicator display with delay
          if (isCurrentConversation && resolvedOtherParticipantIdStr) {
            // For currently open conversation, show read indicators with delay
            newlyReadMessages.forEach(msgId => {
              // Cancel any existing pending timer for this message
              const existingTimer = pendingReadTimersRef.current.get(msgId);
              if (existingTimer) {
                clearTimeout(existingTimer);
                console.log(`[Messages] ⏹️ Cancelled existing read indicator timer for message: ${msgId}`);
              }
              
              // Start delay timer for visual indicator display
              console.log(`[Messages] ⏱️ Starting readIndicatorDelayTimer for message: ${msgId} (delay: ${READ_INDICATOR_DELAY_MS}ms)`);
              
              const timerId = setTimeout(() => {
                // Remove timer from tracking
                pendingReadTimersRef.current.delete(msgId);
                
                // Update message state to show read indicator (use flushSync for immediate render)
                flushSync(() => {
                  setMessages(prev => {
                    return prev.map(msg => {
                      if (msg._id === msgId) {
                        const msgSenderId = msg.sender._id?.toString() || String(msg.sender._id || '');
                        const isOurMessage = msgSenderId === currentUserIdStr;
                        
                        if (isOurMessage) {
                          // Check if message is still marked as read (cancel if contradictory event arrived)
                          const currentReadBy = lastKnownReadStateRef.current.get(msgId) || new Set<string>();
                          if (currentReadBy.has(resolvedOtherParticipantIdStr)) {
                            // Still read - show indicator
                            const alreadyInSeenBy = msg.seenBy && Array.isArray(msg.seenBy) && msg.seenBy.some((id: any) => {
                              let idStr: string;
                              if (typeof id === 'string') {
                                idStr = id;
                              } else if (id && typeof id === 'object' && 'toString' in id) {
                                idStr = id.toString();
                              } else {
                                idStr = String(id);
                              }
                              return idStr === resolvedOtherParticipantIdStr;
                            });
                            
                            if (!alreadyInSeenBy) {
                              // Find the other participant object to add to seenBy
                              const otherParticipant = fetchedMessages[0]?.sender?._id === resolvedOtherParticipantIdStr 
                                ? fetchedMessages[0].sender 
                                : currentConv?.participants.find(p => {
                                    const pId = p._id?.toString() || String(p._id || '');
                                    return pId === resolvedOtherParticipantIdStr;
                                  }) || currentConv?.otherParticipant;
                              
                              if (otherParticipant) {
                                console.log(`[Messages] ✅ readIndicatorShown for message: ${msgId} at ${new Date().toISOString()}`);
                                return {
                                  ...msg,
                                  seenBy: [...(msg.seenBy || []), otherParticipant._id || resolvedOtherParticipantIdStr]
                                };
                              }
                            }
                          } else {
                            // Read state was rolled back - cancel indicator
                            console.log(`[Messages] ⚠️ Read state rolled back for message: ${msgId} - cancelling indicator`);
                            return msg;
                          }
                        }
                      }
                      return msg;
                    });
                  });
                });
              }, READ_INDICATOR_DELAY_MS);
              
              // Store timer for potential cancellation
              pendingReadTimersRef.current.set(msgId, timerId);
              });
            }
          }
        } catch (error) {
          // Only throw Error instances
          const err = error instanceof Error ? error : new Error(`Failed to fetch messages after read: ${String(error)}`);
          console.error('[Messages] ❌ Failed to fetch messages after read:', err);
        }
      } catch (err) {
        // Only throw Error instances - catch any errors from the handler itself
        const error = err instanceof Error ? err : new Error(`message:seen handler error: ${String(err)}`);
        console.error('[Messages] message:seen handler error', error);
        // Don't re-throw - log and continue
      }
      
      // Refresh conversations list to update unread counts (outside try-catch so it always runs)
      try {
        fetchConversations();
      } catch (err) {
        // Log but don't throw
        const error = err instanceof Error ? err : new Error(`Failed to fetch conversations: ${String(err)}`);
        console.error('[Messages] Failed to fetch conversations after message:seen', error);
      }
    });

    // Typing indicator listener (scoped to current conversation via ref)
    onTyping((payload) => {
      try {
        // Validate payload (additional validation beyond SocketContext)
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid typing payload: payload is not an object');
        }
        if (!payload.conversationId || typeof payload.conversationId !== 'string') {
          throw new Error('Invalid typing payload: missing or invalid conversationId');
        }
        if (!payload.userId || typeof payload.userId !== 'string') {
          throw new Error('Invalid typing payload: missing or invalid userId');
        }
        if (typeof payload.isTyping !== 'boolean') {
          throw new Error('Invalid typing payload: missing or invalid isTyping');
        }
        
        const isCurrentConversation = payload.conversationId === selectedConversationIdRef.current;
        const isOtherUser = payload.userId !== user?._id;
        const isViewingConversation = isCurrentConversation && 
                                       document.visibilityState === 'visible' && 
                                       window.__activeConversationId === payload.conversationId;
      
      if (isCurrentConversation && isOtherUser) {
        const isNowTyping = !!payload.isTyping;
        const wasTyping = previousTypingStateRef.current.get(payload.conversationId) || false;
        
        // Move metrics tracking to async (non-blocking) to prevent typing lag
        const scheduleAsync = typeof requestIdleCallback !== 'undefined' 
          ? (cb: () => void) => requestIdleCallback(cb, { timeout: 100 })
          : (cb: () => void) => setTimeout(cb, 0);
        
        if (payload.timestamp) {
          scheduleAsync(() => {
            const serverEmitTime = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
          const broadcastLatency = Date.now() - serverEmitTime;
          typingMetricsRef.current.broadcastLatencies.push(broadcastLatency);
          // Keep only last 100 latencies
          if (typingMetricsRef.current.broadcastLatencies.length > 100) {
            typingMetricsRef.current.broadcastLatencies.shift();
          }
          });
        }
        
        // Update previous typing state for this conversation
        previousTypingStateRef.current.set(payload.conversationId, isNowTyping);
        
        // Use startTransition for non-blocking UI updates (typing indicator)
        // This prevents blocking the main thread and keeps typing smooth
        // Typing indicator updates are low-priority and won't block user input
        startTransition(() => {
          setIsOtherTyping(isNowTyping);
          setOtherTypingName(isNowTyping ? (payload.userName || 'User') : null);
        });
        
        if (isNowTyping && typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        // CRITICAL: Only play typing sound when typing STARTS (transitions from false to true)
        // This prevents the sound from playing on every keystroke/typing event
        // Typing events are emitted every 400ms while typing, so we need to debounce the sound
        if (isNowTyping && !wasTyping) {
          // Typing just started - play sound once per typing session
          const soundAlreadyPlayed = typingSoundPlayedRef.current.get(payload.conversationId) || false;
          
          if (isViewingConversation && !soundAlreadyPlayed) {
            // Mark sound as played for this conversation's typing session
            typingSoundPlayedRef.current.set(payload.conversationId, true);
            
            // Move sound and logging to async (non-blocking)
            scheduleAsync(() => {
            console.log('[Messages] 🔊 Playing typing sound (typing session started)');
            });
            
            playTyping().catch((err) => {
              const error = err && err.error ? err.error : (err && err.message ? err.message : String(err));
              console.warn('[Messages] playTyping failed:', error);
            });
          }
        } else if (!isNowTyping && wasTyping) {
          // Typing just stopped - reset the sound flag for next typing session
          typingSoundPlayedRef.current.set(payload.conversationId, false);
          previousTypingStateRef.current.set(payload.conversationId, false);
          
          // Move logging to async
          scheduleAsync(() => {
          console.log('[Messages] ⏹️ Typing stopped - reset sound flag for next session');
          });
        }
        
        if (isNowTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            startTransition(() => {
            setIsOtherTyping(false);
            });
            // Reset sound flag and previous state when typing indicator times out
            typingSoundPlayedRef.current.set(payload.conversationId, false);
            previousTypingStateRef.current.set(payload.conversationId, false);
          }, 3000);
        }
      } else if (!isCurrentConversation) {
        // Ensure indicator is cleared if typing belongs to another conversation
        // Use startTransition for non-blocking update
        startTransition(() => {
        setIsOtherTyping(false);
        });
        // Also reset sound flag and previous state for conversations we're not viewing
        typingSoundPlayedRef.current.delete(payload.conversationId);
        previousTypingStateRef.current.delete(payload.conversationId);
      }
      } catch (err) {
        // Only throw Error instances
        const error = err instanceof Error ? err : new Error(`typing handler error: ${String(err)}`);
        console.error('[Messages] typing handler error', error);
        // Don't re-throw - log and continue
      }
    });

    return () => {
      isMessagesMountedRef.current = false;
      // Leave any active room to avoid stale seen events if we navigate away
      if (selectedConversationIdRef.current) {
        try { leaveConversation(selectedConversationIdRef.current); } catch {}
      }
      // Clear all pending status timers on unmount
      pendingReadTimersRef.current.forEach(timer => clearTimeout(timer));
      pendingReadTimersRef.current.clear();
      pendingStatusRenderTimersRef.current.forEach(timer => clearTimeout(timer));
      pendingStatusRenderTimersRef.current.clear();
      bufferedStatusRef.current.clear();
      highestStatusRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper function to get status priority (higher number = higher priority)
  // Status order: In progress... (0) < Sent (1) < Delivered (2) < Read (3)
  const getStatusPriority = useCallback((status: string): number => {
    const statusOrder: Record<string, number> = {
      'In progress...': 0,
      'Sent': 1,
      'Delivered': 2,
      'Read': 3,
    };
    return statusOrder[status] ?? -1;
  }, []);

  // Helper function to get the highest status across all sources for a message
  // CRITICAL: Checks ALL sources (renderedStatus, messageStatus, bufferedStatusRef, message object)
  // to find the highest priority status and prevent backward transitions
  const getHighestStatus = useCallback((messageId: string, message?: Message, currentRenderedStatus?: Record<string, string>, currentMessageStatus?: Record<string, string>): string | null => {
    const statusOrder: Record<string, number> = {
      'In progress...': 0,
      'Sent': 1,
      'Delivered': 2,
      'Read': 3,
    };
    
    const statuses: string[] = [];
    
    // Use provided state or fall back to current state
    const rendered = currentRenderedStatus || renderedStatus;
    const msgStatus = currentMessageStatus || messageStatus;
    
    // Check renderedStatus (what's currently displayed)
    if (rendered[messageId]) {
      statuses.push(rendered[messageId]);
    }
    
    // Check messageStatus (internal tracking)
    if (msgStatus[messageId]) {
      statuses.push(msgStatus[messageId]);
    }
    
    // Check bufferedStatusRef (pending updates)
    const buffered = bufferedStatusRef.current.get(messageId);
    if (buffered) {
      statuses.push(buffered);
    }
    
    // Check message object for delivery/read status
    if (message) {
      // Check if message is read (highest priority)
      if (message.seenBy && Array.isArray(message.seenBy) && message.seenBy.length > 0) {
        statuses.push('Read');
      }
      // Check if message is delivered
      if (message.deliveredTo && Array.isArray(message.deliveredTo) && message.deliveredTo.length > 0) {
        statuses.push('Delivered');
      }
    }
    
    // Find the highest priority status
    let highestStatus: string | null = null;
    let highestPriority = -1;
    
    for (const status of statuses) {
      const priority = statusOrder[status] ?? -1;
      if (priority > highestPriority) {
        highestPriority = priority;
        highestStatus = status;
      }
    }
    
    return highestStatus;
  }, [renderedStatus, messageStatus]);

  // Subscribe to dispatched updates to apply status changes and conversation counts
  useDispatchedUpdates((update: DispatchedUpdate) => {
    // Handle status updates with rendering buffer to prevent visual jumps
    // CRITICAL: Use statusUpdatesWithSeq to check sequence numbers and prevent out-of-order updates
    const statusUpdatesToProcess = update.statusUpdatesWithSeq || new Map();
    
    // Fallback to statusUpdates for backward compatibility
    if (statusUpdatesToProcess.size === 0 && update.statusUpdates.size > 0) {
      update.statusUpdates.forEach((status, messageId) => {
        statusUpdatesToProcess.set(messageId, {
          status,
          seq: 0, // Unknown sequence
          timestamp: update.timestamp,
        });
      });
    }
    
    if (statusUpdatesToProcess.size > 0) {
      statusUpdatesToProcess.forEach((statusUpdate, messageId) => {
        const { status, seq: eventSeq, timestamp: eventTimestamp } = statusUpdate;
        
        // CRITICAL: Get the highest status across ALL sources (rendered, messageStatus, buffered, message object)
        // This ensures we never accept a status that's lower than what we already have
        const message = messages.find(m => m._id === messageId);
        const highestCurrentStatus = getHighestStatus(messageId, message);
        const highestCurrentPriority = getStatusPriority(highestCurrentStatus || '');
        const newPriority = getStatusPriority(status);
        
        // CRITICAL: Check sequence number to prevent out-of-order updates
        // Primary ordering: sequence number
        // Tie-breaker 1: timestamp (if seq equal)
        // Tie-breaker 2: node-id (if seq and timestamp equal) - for multi-instance reliability
        const lastSeq = messageSeqRef.current.get(messageId) ?? 0;
        const lastTimestamp = messageSeqRef.current.get(`${messageId}_timestamp`) ?? 0;
        const lastNodeId = messageSeqNodeRef.current.get(messageId) ?? '';
        const eventNodeId = (statusUpdate as any).nodeId || '';
        
        // Check if event is newer (strictly greater sequence, or equal seq with newer timestamp/node-id)
        const isNewerSeq = eventSeq > lastSeq;
        const isEqualSeqNewerTimestamp = eventSeq === lastSeq && eventTimestamp > lastTimestamp;
        const isEqualSeqEqualTimestampNewerNodeId = eventSeq === lastSeq && eventTimestamp === lastTimestamp && eventNodeId > lastNodeId;
        const isNewerEvent = isNewerSeq || isEqualSeqNewerTimestamp || isEqualSeqEqualTimestampNewerNodeId;
        const isValidSequence = eventSeq === 0 || isNewerEvent || eventSeq >= lastSeq; // Allow seq=0 for backward compatibility
        
        // CRITICAL: Only accept new status if it's STRICTLY higher than the highest current status
        // This prevents ANY backward transitions, regardless of source
        const isHigherThanCurrent = newPriority > highestCurrentPriority;
        
        // CRITICAL: NEVER accept "In progress..." if:
        // 1. Message has already been sent (in sentMessagesRef), OR
        // 2. Highest current status is "Sent" or higher (priority >= 1), OR
        // 3. Message has a real ID (not temp) - real messages should never show "In progress..."
        // CRITICAL: Also NEVER accept any status lower than "Read" if message is already read
        const isInProgressStatus = status === 'In progress...';
        const isMessageSent = sentMessagesRef.current.has(messageId);
        const hasRealId = message && !message._id.startsWith('temp-');
        const isAlreadyRead = highestCurrentStatus === 'Read' || highestCurrentPriority >= 3;
        const isNotInProgressAfterSend = !isInProgressStatus || (!isMessageSent && highestCurrentPriority < 1 && !hasRealId);
        const isNotLowerThanRead = !isAlreadyRead || newPriority >= 3; // Never accept lower status if already Read
        
        // CRITICAL: Read status must be applied IMMEDIATELY - bypass all buffers
        // Read events are final and authoritative - no artificial latency
        const isReadStatusUpdate = status === 'Read';
        const isDeliveredStatusUpdate = status === 'Delivered';
        const isSentStatusUpdate = status === 'Sent';
        
        // Apply status update if valid
        if (isValidSequence && (isHigherThanCurrent || isReadStatusUpdate || isDeliveredStatusUpdate || isSentStatusUpdate) && isNotInProgressAfterSend && isNotLowerThanRead) {
          // Update sequence tracking
          if (eventSeq > 0) {
            messageSeqRef.current.set(messageId, eventSeq);
            messageSeqRef.current.set(`${messageId}_timestamp`, eventTimestamp);
            if (eventNodeId) {
              messageSeqNodeRef.current.set(messageId, eventNodeId);
            }
          }
          
          // Update highestStatusRef
          highestStatusRef.current.set(messageId, status);
          
          // Cancel any pending timers for intermediate statuses
          const existingTimer = pendingStatusRenderTimersRef.current.get(messageId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            pendingStatusRenderTimersRef.current.delete(messageId);
          }
          bufferedStatusRef.current.delete(messageId);
          
          // Apply status update IMMEDIATELY for Read, or with buffer for others
          if (isReadStatusUpdate) {
            // Read status - apply IMMEDIATELY
            flushSync(() => {
              setMessageStatus(prev => {
                const current = prev[messageId];
                if (current !== 'Read') {
                  return { ...prev, [messageId]: 'Read' };
                }
                return prev;
              });
              
              setRenderedStatus(prev => {
                const current = prev[messageId];
                if (current !== 'Read') {
                  return { ...prev, [messageId]: 'Read' };
                }
                return prev;
              });
            });
          } else {
            // Delivered or Sent - apply with minimal delay
            setMessageStatus(prev => {
              const current = prev[messageId];
              if (newPriority > getStatusPriority(current || '')) {
                return { ...prev, [messageId]: status };
              }
              return prev;
            });
            
            // Update rendered status after a short delay to prevent flicker
            const timer = setTimeout(() => {
              setRenderedStatus(prev => {
                const current = prev[messageId];
                if (newPriority > getStatusPriority(current || '')) {
                  return { ...prev, [messageId]: status };
                }
                return prev;
              });
              pendingStatusRenderTimersRef.current.delete(messageId);
            }, 50); // Short delay for visual smoothness
            
            pendingStatusRenderTimersRef.current.set(messageId, timer);
          }
          
          console.log(`[Messages] ✅ Status update applied: ${messageId} -> ${status} (seq ${eventSeq})`);
        } else if (isHigherThanCurrent && isValidSequence && isNotInProgressAfterSend && isNotLowerThanRead && !isReadStatusUpdate && !isDeliveredStatusUpdate && !isSentStatusUpdate) {
          // Non-Read status updates - use normal buffering
          // Update sequence tracking
          if (eventSeq > 0) {
            messageSeqRef.current.set(messageId, eventSeq);
            messageSeqRef.current.set(`${messageId}_timestamp`, eventTimestamp);
            const eventNodeId = (statusUpdate as any).nodeId || '';
            if (eventNodeId) {
              messageSeqNodeRef.current.set(messageId, eventNodeId);
            }
          }
          console.log(`[Messages] 📦 Buffering status update: ${messageId} -> ${status} (highest current: ${highestCurrentStatus || 'none'}, priority: ${highestCurrentPriority} -> ${newPriority})`);
          bufferedStatusRef.current.set(messageId, status);
          
          // CRITICAL: Update highestStatusRef synchronously to prevent backward transitions
          const currentHighest = highestStatusRef.current.get(messageId);
          const currentHighestPriority = getStatusPriority(currentHighest || '');
          if (newPriority > currentHighestPriority) {
            highestStatusRef.current.set(messageId, status);
          }
          
          // Update messageStatus immediately (for internal tracking)
          // CRITICAL: Only update if new status is strictly higher than current
          setMessageStatus(prev => {
            const next = { ...prev };
            const currentStatus = prev[messageId];
            const currentStatusPriority = getStatusPriority(currentStatus || '');
            
            // Only update if new status is higher priority than current
            if (newPriority > currentStatusPriority) {
              next[messageId] = status;
            } else {
              console.log(`[Messages] ⏭️ Skipping backward status update in messageStatus: ${messageId} -> ${status} (current: ${currentStatus || 'none'}, priority: ${currentStatusPriority} >= ${newPriority})`);
            }
            return next;
          });
          
          // Clear existing render timer for this message
          const existingTimer = pendingStatusRenderTimersRef.current.get(messageId);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          
          // Schedule render update after buffer delay (only show latest status)
          const timer = setTimeout(() => {
            const latestStatus = bufferedStatusRef.current.get(messageId);
            if (latestStatus) {
              // CRITICAL: Final check before rendering - get highest status across ALL sources
              // This ensures we never render a status that's lower than what we already have
              setRenderedStatus(prev => {
                const currentMessage = messages.find(m => m._id === messageId);
                // Get highest status BEFORE applying latestStatus (use prev state to avoid stale closure)
                const highestStatusBeforeRender = getHighestStatus(messageId, currentMessage, prev, messageStatus);
                const highestPriorityBeforeRender = getStatusPriority(highestStatusBeforeRender || '');
                const latestPriority = getStatusPriority(latestStatus);
                
                // Only render if latest status is strictly higher than highest current status
                // This prevents ANY backward transitions
                const shouldRender = latestPriority > highestPriorityBeforeRender;
                
                if (shouldRender) {
                  console.log(`[Messages] ✅ Rendering status after buffer: ${messageId} -> ${latestStatus} (was: ${highestStatusBeforeRender || 'none'}, priority: ${highestPriorityBeforeRender} -> ${latestPriority})`);
                  // CRITICAL: Update highestStatusRef when rendering new status
                  highestStatusRef.current.set(messageId, latestStatus);
                  const next = { ...prev };
                  next[messageId] = latestStatus;
                  return next;
                } else {
                  console.log(`[Messages] ⏭️ Skipping backward status render: ${messageId} -> ${latestStatus} (highest current: ${highestStatusBeforeRender || 'none'}, priority: ${latestPriority} <= ${highestPriorityBeforeRender})`);
                  return prev;
                }
              });
              // Clean up
              pendingStatusRenderTimersRef.current.delete(messageId);
              bufferedStatusRef.current.delete(messageId);
            }
          }, STATUS_RENDER_BUFFER_MS);
          
          pendingStatusRenderTimersRef.current.set(messageId, timer);
        } else {
          // Track status glitches (backward transition attempts) for metrics
          if (!isHigherThanCurrent || !isValidSequence) {
            const glitchCount = statusGlitchCountRef.current.get(messageId) || 0;
            statusGlitchCountRef.current.set(messageId, glitchCount + 1);
          }
          
          // Log reason for rejection
          if (!isValidSequence) {
            console.log(`[Messages] ⏭️ Skipping out-of-order status: ${messageId} -> ${status} (seq ${eventSeq} <= ${lastSeq}, highest current: ${highestCurrentStatus || 'none'})`);
          } else if (!isHigherThanCurrent) {
            const glitchCount = statusGlitchCountRef.current.get(messageId) || 0;
            console.warn(`[Messages] ⚠️ Status glitch detected: ${messageId} (attempted: ${status}, current: ${highestCurrentStatus || 'none'}, glitchCount: ${glitchCount + 1})`);
            console.log(`[Messages] ⏭️ Skipping lower/equal priority status: ${messageId} -> ${status} (priority: ${newPriority} <= ${highestCurrentPriority}, highest current: ${highestCurrentStatus || 'none'})`);
          } else if (!isNotInProgressAfterSend) {
            console.log(`[Messages] ⏭️ Skipping "In progress..." - message ${messageId} already sent or has higher status (${highestCurrentStatus || 'none'})`);
          } else {
            console.log(`[Messages] ⏭️ Skipping status update: ${messageId} -> ${status} (highest current: ${highestCurrentStatus || 'none'})`);
          }
        }
      });
    }
    
    // Handle conversation count updates (unified latency with other notification surfaces)
    if (update.conversationCountUpdates && update.conversationCountUpdates.size > 0) {
      console.log(`[Messages] 📬 Received conversation count updates from dispatcher:`, Array.from(update.conversationCountUpdates.entries()));
      setConversations(prev => {
        const next = [...prev];
        update.conversationCountUpdates.forEach((increment, conversationId) => {
          const index = next.findIndex(c => c._id === conversationId);
          if (index !== -1) {
            const currentCount = next[index].unreadCount || 0;
            next[index] = {
              ...next[index],
              unreadCount: Math.max(0, currentCount + increment),
            };
            console.log(`[Messages] ✅ Updated conversation count: ${conversationId} -> ${next[index].unreadCount} (incremented by ${increment})`);
          } else {
            // Conversation not in list yet, will be added when fetchConversations() runs
            console.log(`[Messages] ⚠️ Conversation ${conversationId} not found in list, will be updated on next fetch`);
          }
        });
        return next;
      });
    }
  });

  const fetchConversations = async () => {
    const now = Date.now();
    if (fetchingConvosRef.current) return;
    if (now - lastConvosFetchRef.current < 1000) return; // throttle to 1s
    fetchingConvosRef.current = true;
    try {
      const response = await axios.get('/messages/conversations');
      if (response.data.success) {
        const unique: Conversation[] = Array.from(new Map<string, Conversation>(
          (response.data.conversations as Conversation[]).map((c) => [c._id, c])
        ).values());
        
        // Preserve optimistic unreadCount: 0 for currently selected conversation
        setConversations(prev => {
          const currentConvId = selectedConversationIdRef.current;
          return unique.map(conv => {
            // If this is the currently selected conversation and we optimistically set unreadCount to 0,
            // keep it at 0 instead of overriding with server value
            if (conv._id === currentConvId) {
              const prevConv = prev.find(c => c._id === currentConvId);
              if (prevConv && prevConv.unreadCount === 0) {
                return { ...conv, unreadCount: 0 };
              }
            }
            return conv;
          });
        });
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
      fetchingConvosRef.current = false;
      lastConvosFetchRef.current = Date.now();
    }
  };

  // Periodic check for expired mutes (every 30 seconds)
  // Use ref to track last backend check time to avoid dependency issues
  const lastBackendCheckRef = useRef<number>(0);
  const BACKEND_CHECK_INTERVAL = 120000; // 2 minutes

  useEffect(() => {
    if (!user) return;

    const checkMuteExpiration = async () => {
      try {
        // Check local state first (fast check)
        const now = new Date();
        let hasExpiredMutes = false;
        const expiredConversationIds: string[] = [];
        const expiredConvs: Conversation[] = [];

        setConversations(prev => {
          return prev.map(conv => {
            if (conv.isMuted && conv.mutedUntil) {
              // Check if mute has expired
              const mutedUntilDate = new Date(conv.mutedUntil);
              if (mutedUntilDate <= now) {
                hasExpiredMutes = true;
                expiredConversationIds.push(conv._id);
                expiredConvs.push({ ...conv }); // Store copy for toast
                console.log(`[Messages] ⏰ Mute expired for conversation ${conv._id}`);
                return { ...conv, isMuted: false, mutedUntil: undefined };
              }
            }
            return conv;
          });
        });

        // Update selected conversation if it's one of the expired ones
        if (expiredConversationIds.length > 0) {
          setSelectedConversation(prev => {
            if (prev && expiredConversationIds.includes(prev._id)) {
              return { ...prev, isMuted: false, mutedUntil: undefined };
            }
            return prev;
          });

          // Show toast for expired mutes
          expiredConvs.forEach(conv => {
            const otherName = conv?.otherParticipant?.name || 'Conversation';
            pushToast(
              `${otherName} is no longer muted. You'll receive notifications again.`,
              {
                conversationId: conv._id,
                senderName: otherName,
                senderAvatar: conv?.otherParticipant?.profilePicture,
              }
            );
          });
        }

        // Also check with backend to ensure sync and cleanup (every 2 minutes)
        // This ensures backend also cleans up expired mutes
        const nowTime = Date.now();
        const shouldCheckBackend = (nowTime - lastBackendCheckRef.current) >= BACKEND_CHECK_INTERVAL || hasExpiredMutes;
        if (shouldCheckBackend) {
          lastBackendCheckRef.current = nowTime;
          try {
            const response = await axios.get('/messages/conversations/mute-status');
            if (response.data.success && response.data.hasChanges) {
              // Backend cleaned up some expired mutes, refresh conversations
              console.log('[Messages] Backend cleaned up expired mutes, refreshing conversations');
              fetchConversations();
            } else if (response.data.success) {
              // Sync mute status from backend (in case of discrepancies)
              const muteStatuses = response.data.muteStatuses || [];
              setConversations(prev => {
                return prev.map(conv => {
                  const status = muteStatuses.find((s: any) => s.conversationId === conv._id);
                  if (status) {
                    const isMuted = status.isMuted || false;
                    const mutedUntil = status.mutedUntil ? new Date(status.mutedUntil).toISOString() : (status.isMuted ? null : undefined);
                    // Only update if there's a change
                    if (conv.isMuted !== isMuted || conv.mutedUntil !== mutedUntil) {
                      return { ...conv, isMuted, mutedUntil };
                    }
                  }
                  return conv;
                });
              });
            }
          } catch (error) {
            console.error('[Messages] Failed to check mute status:', error);
          }
        }
      } catch (error) {
        console.error('[Messages] Error checking mute expiration:', error);
      }
    };

    // Check immediately on mount
    checkMuteExpiration();

    // Then check every 30 seconds
    const interval = setInterval(checkMuteExpiration, 30000);

    return () => clearInterval(interval);
  }, [user, pushToast]);

  const fetchMessages = async (conversationId: string) => {
    try {
      const response = await axios.get(`/messages/conversations/${conversationId}/messages`);
      if (response.data.success) {
        const uniqueMsgs: Message[] = Array.from(new Map<string, Message>(
          (response.data.messages as Message[]).map((m) => [m._id, m])
        ).values());
        setMessages(uniqueMsgs);
        
        // Update read state tracking for our sent messages
        // This helps us detect NEW reads (not just when we open the conversation)
        if (user?._id) {
          const currentConv = conversations.find(c => c._id === conversationId);
          const otherParticipantId = currentConv?.otherParticipant?._id || 
            currentConv?.participants.find(p => p._id !== user._id)?._id;
          
          if (otherParticipantId) {
            const otherParticipantIdStr = otherParticipantId.toString();
            
            // Update last known read state for our sent messages and mark as read if already read
            uniqueMsgs.forEach(msg => {
              const isOurMessage = msg.sender._id === user._id || msg.sender._id?.toString() === user._id?.toString();
              if (isOurMessage && msg.seenBy && Array.isArray(msg.seenBy)) {
                const readBySet = new Set<string>();
                msg.seenBy.forEach((id: any) => {
                  const idStr = typeof id === 'string' ? id : (id?.toString ? id.toString() : String(id));
                  readBySet.add(idStr);
                });
                lastKnownReadStateRef.current.set(msg._id, readBySet);
                
                // If message was already read by the other participant, mark it as read in status
                // This ensures indicators show up even if sender wasn't viewing when read happened
                if (readBySet.has(otherParticipantIdStr)) {
                  setMessageStatus(prev => {
                    // Only update if not already set to avoid overriding 'Read' status
                    if (prev[msg._id] !== 'Read') {
                      return { ...prev, [msg._id]: 'Read' };
                    }
                    return prev;
                  });
                  // Also update rendered status immediately for "Read" (bypass buffer)
                  setRenderedStatus(prev => {
                    if (prev[msg._id] !== 'Read') {
                      return { ...prev, [msg._id]: 'Read' };
                    }
                    return prev;
                  });
                  // Cancel any pending render timer for this message
                  const existingTimer = pendingStatusRenderTimersRef.current.get(msg._id);
                  if (existingTimer) {
                    clearTimeout(existingTimer);
                    pendingStatusRenderTimersRef.current.delete(msg._id);
                  }
                  bufferedStatusRef.current.delete(msg._id);
                  
                  // Mark sound as already played for messages that were read before we opened the conversation
                  // This prevents playing sound for old reads when opening the conversation
                  if (!readSoundPlayedRef.current.has(msg._id)) {
                    readSoundPlayedRef.current.add(msg._id);
                  }
                }
              }
            });
          }
        }
        
        // Update message status based on delivery info from server
        // Check all messages sent by current user and update their status
        // NOTE: Do NOT play sent sound here - it should only play when we receive message:sent event
        if (user?._id) {
          const statusUpdates: Record<string, string> = {};
          // Get the other participant ID for this conversation
          const currentConv = conversations.find(c => c._id === conversationId);
          const otherParticipantId = currentConv?.otherParticipant?._id || 
            currentConv?.participants.find(p => p._id !== user._id)?._id;
          
          if (otherParticipantId) {
            const otherParticipantIdStr = otherParticipantId.toString();
            uniqueMsgs.forEach(msg => {
              // Only check messages sent by current user
              if (msg.sender._id === user._id || msg.sender._id?.toString() === user._id) {
                const currentStatus = messageStatus[msg._id] || 'Sent'; // Default to 'Sent' if not set
                let newStatus: string | null = null;
                
                // Check if message was seen (highest priority)
                if (msg.seenBy && Array.isArray(msg.seenBy) && msg.seenBy.some(id => {
                  let idStr: string;
                  if (typeof id === 'string') {
                    idStr = id;
                  } else if (id && typeof id === 'object' && 'toString' in id) {
                    idStr = (id as any).toString();
                  } else {
                    idStr = String(id);
                  }
                  return idStr === otherParticipantIdStr;
                })) {
                  newStatus = 'Read';
                } 
                // Check if message was delivered
                else if (msg.deliveredTo && Array.isArray(msg.deliveredTo) && msg.deliveredTo.some(d => {
                  if (!d.userId) return false;
                  let deliveredToUserIdStr: string;
                  if (typeof d.userId === 'string') {
                    deliveredToUserIdStr = d.userId;
                  } else if (d.userId && typeof d.userId === 'object' && 'toString' in d.userId) {
                    deliveredToUserIdStr = (d.userId as any).toString();
                  } else {
                    deliveredToUserIdStr = String(d.userId);
                  }
                  return deliveredToUserIdStr === otherParticipantIdStr;
                })) {
                  newStatus = 'Delivered';
                }
                // Otherwise, if no delivery info found, set to 'Sent'
                else {
                  newStatus = 'Sent';
                }
                
                // Only update status if it changed
                // CRITICAL: Do NOT play sent sound here - it should only play when we receive message:sent event
                // fetchMessages() is called AFTER message:delivered, so sound should have already played on message:sent
                // If sound hasn't played yet, it means message:sent hasn't arrived, so we should NOT play sound here
                // Sound should ONLY play on message:sent event, never on fetchMessages status updates
                if (newStatus && newStatus !== currentStatus) {
                  statusUpdates[msg._id] = newStatus;
                  
                  // Log status transitions for debugging
                  const soundAlreadyPlayed = sentSoundPlayedRef.current.has(msg._id);
                  console.log('[Messages] Status update from fetchMessages:', {
                    messageId: msg._id,
                    prevStatus: currentStatus,
                    newStatus,
                    source: 'fetchMessages',
                    soundAlreadyPlayed, // Log whether sound was already played
                    timestamp: new Date().toISOString()
                  });
                  
                  // CRITICAL: If status is being set to "Delivered" or "Read" and sound hasn't played,
                  // it means message:sent hasn't arrived yet. Do NOT play sound here - wait for message:sent event.
                  if ((newStatus === 'Delivered' || newStatus === 'Read') && !soundAlreadyPlayed) {
                    console.log('[Messages] ⚠️ Status updated to', newStatus, 'but sound not played yet - waiting for message:sent event');
                  }
                } else if (!newStatus && !currentStatus) {
                  // Message doesn't have a status yet, default to 'Sent'
                  statusUpdates[msg._id] = 'Sent';
                }
              }
            });
            
            // Update statuses (for internal tracking)
            // Also schedule render updates with buffer to prevent visual jumps
            if (Object.keys(statusUpdates).length > 0) {
              setMessageStatus(prev => ({ ...prev, ...statusUpdates }));
              
              // Schedule render updates with buffer delay
              Object.entries(statusUpdates).forEach(([messageId, status]) => {
                // For "Read" status, render immediately (bypass buffer)
                if (status === 'Read') {
                  setRenderedStatus(prev => {
                    const next = { ...prev };
                    next[messageId] = status;
                    return next;
                  });
                  // Cancel any pending timer
                  const existingTimer = pendingStatusRenderTimersRef.current.get(messageId);
                  if (existingTimer) {
                    clearTimeout(existingTimer);
                    pendingStatusRenderTimersRef.current.delete(messageId);
                  }
                  bufferedStatusRef.current.delete(messageId);
                } else {
                  // For other statuses, buffer the render update
                  bufferedStatusRef.current.set(messageId, status);
                  const existingTimer = pendingStatusRenderTimersRef.current.get(messageId);
                  if (existingTimer) {
                    clearTimeout(existingTimer);
                  }
                  const timer = setTimeout(() => {
                    const latestStatus = bufferedStatusRef.current.get(messageId);
                    if (latestStatus) {
                      setRenderedStatus(prev => {
                        const next = { ...prev };
                        next[messageId] = latestStatus;
                        return next;
                      });
                      pendingStatusRenderTimersRef.current.delete(messageId);
                      bufferedStatusRef.current.delete(messageId);
                    }
                  }, STATUS_RENDER_BUFFER_MS);
                  pendingStatusRenderTimersRef.current.set(messageId, timer);
                }
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const markAsRead = async (conversationId: string) => {
    try {
      await axios.post(`/messages/conversations/${conversationId}/read`);
      // Server will emit notifications:refresh-count event, which will trigger
      // notifications dropdown/inbox to refresh automatically
      console.log('[Messages] Marked conversation as read, notifications should be updated automatically');
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    // Read from uncontrolled input ref instead of state
    const inputValue = messageInputRef.current?.value?.trim() || '';
    if (!inputValue || !selectedConversation || sending) return;

    setSending(true);
    try {
      // Optimistic UI: add temp message
      const tempId = `temp-${Date.now()}`;
      const optimistic: Message = {
        _id: tempId,
        sender: { _id: user?._id || 'me', name: user?.name || 'Me', profilePicture: user?.profilePicture },
        content: inputValue,
        attachments: [],
        seenBy: [],
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimistic]);
      
      // Clear input immediately (uncontrolled, so clear the ref value)
      if (messageInputRef.current) {
        messageInputRef.current.value = '';
      }
      
      // Track when we started the request to determine if we should show "In progress..."
      const requestStartTime = Date.now();
      let progressTimer: NodeJS.Timeout | null = null;
      
      // Only show "In progress..." if the request takes longer than threshold
      // This prevents showing it for fast uploads
      // CRITICAL: Store tempId in closure to check if it still exists when timer fires
      progressTimer = setTimeout(() => {
        // CRITICAL: Check if message has already been sent - if so, don't set "In progress..."
        if (sentMessagesRef.current.has(tempId)) {
          console.log(`[Messages] ⏭️ Skipping "In progress..." - message ${tempId} already sent`);
          return;
        }
        
        // Only set "In progress..." if request is still ongoing AND tempId still exists
        // Check if tempId is still in messages (hasn't been replaced by real message)
        setMessages(currentMessages => {
          const tempMessageExists = currentMessages.some(m => m._id === tempId);
          if (!tempMessageExists) {
            // Message has been replaced, don't set "In progress..."
            return currentMessages;
          }
          
          // CRITICAL: Check highest status using ref (synchronous, always up-to-date)
          // This prevents setting "In progress..." if ANY source shows "Sent" or higher
          const tempMessage = currentMessages.find(m => m._id === tempId);
          const highestStatus = highestStatusRef.current.get(tempId);
          const highestPriority = getStatusPriority(highestStatus || '');
          
          // NEVER set "In progress..." if:
          // 1. Message has already been sent, OR
          // 2. Highest status is "Sent" or higher (priority >= 1), OR
          // 3. Message has a real ID (not temp)
          if (sentMessagesRef.current.has(tempId) || highestPriority >= 1 || (tempMessage && !tempMessage._id.startsWith('temp-'))) {
            console.log(`[Messages] ⏭️ Blocking "In progress..." - message ${tempId} already sent or has higher status (${highestStatus || 'none'}, priority: ${highestPriority})`);
            return currentMessages;
          }
          
          // Only set "In progress..." if status hasn't been set to "Sent" or higher yet
          // Use startTransition for status updates (non-blocking, won't block typing)
          startTransition(() => {
          setMessageStatus(prev => {
            const currentStatus = prev[tempId];
            const currentPriority = getStatusPriority(currentStatus || '');
            // CRITICAL: Never set "In progress..." if we already have "Sent" or higher
            // Also check if message has been sent
            if (currentPriority < 1 && !sentMessagesRef.current.has(tempId)) {
              // CRITICAL: Update highestStatusRef when setting "In progress..."
              highestStatusRef.current.set(tempId, 'In progress...');
              return { ...prev, [tempId]: 'In progress...' };
            }
            return prev;
          });
          // Also update rendered status immediately for "In progress..." (initial state, no buffer)
          setRenderedStatus(prev => {
            const currentStatus = prev[tempId];
            const currentPriority = getStatusPriority(currentStatus || '');
            // CRITICAL: Never set "In progress..." if message has been sent or has higher status
            if (currentPriority < 1 && !sentMessagesRef.current.has(tempId)) {
              return { ...prev, [tempId]: 'In progress...' };
            }
            return prev;
            });
          });
          
          return currentMessages;
        });
      }, IN_PROGRESS_THRESHOLD_MS);

      const response = await axios.post(
        `/messages/conversations/${selectedConversation._id}/messages`,
        { content: inputValue }
      );
      
      // Clear the progress timer since request completed
      if (progressTimer) {
        clearTimeout(progressTimer);
      }
      
      if (response.data.success) {
        setMessageInput('');
        const real: Message = response.data.message;
        const requestDuration = Date.now() - requestStartTime;
        
        // Replace temp with real
        setMessages(prev => prev.map(m => (m._id === tempId ? real : m)));
        
        // CRITICAL: Mark message as sent FIRST to prevent "In progress..." from appearing after send
        // This must happen BEFORE any status updates to ensure the progressTimer callback sees it
        sentMessagesRef.current.add(tempId);
        sentMessagesRef.current.add(real._id);
        
        // CRITICAL: Update highestStatusRef to prevent "In progress..." from being set
        // Set to "Sent" as minimum (will be updated to higher statuses when events arrive)
        highestStatusRef.current.set(tempId, 'Sent');
        highestStatusRef.current.set(real._id, 'Sent');
        
        // CRITICAL: Clear any "In progress..." status immediately and prevent it from being set
        // This must happen synchronously to prevent race conditions with the progressTimer
        flushSync(() => {
          setMessageStatus(prev => {
            const next = { ...prev };
            // Clear tempId status (including "In progress..." if it was shown)
            delete next[tempId];
            // CRITICAL: If "In progress..." was set for real message ID, clear it too
            // This prevents "In progress..." from appearing after "Sent"
            if (next[real._id] === 'In progress...') {
              delete next[real._id];
            }
            // Don't set status for real message ID here - wait for server events
            // This ensures we don't show "Sent" if "Delivered" is coming soon
            return next;
          });
          // Also clear rendered status for tempId to prevent it from showing
          setRenderedStatus(prev => {
            const next = { ...prev };
            delete next[tempId];
            // CRITICAL: If "In progress..." was rendered for real message ID, clear it too
            if (next[real._id] === 'In progress...') {
              delete next[real._id];
            }
            return next;
          });
          // Clear any pending timers for tempId and real message ID
          const tempTimer = pendingStatusRenderTimersRef.current.get(tempId);
          if (tempTimer) {
            clearTimeout(tempTimer);
            pendingStatusRenderTimersRef.current.delete(tempId);
          }
          const realTimer = pendingStatusRenderTimersRef.current.get(real._id);
          if (realTimer) {
            clearTimeout(realTimer);
            pendingStatusRenderTimersRef.current.delete(real._id);
          }
          bufferedStatusRef.current.delete(tempId);
          // CRITICAL: Clear any buffered "In progress..." for real message ID
          if (bufferedStatusRef.current.get(real._id) === 'In progress...') {
            bufferedStatusRef.current.delete(real._id);
          }
        });
        
        if (requestDuration < IN_PROGRESS_THRESHOLD_MS) {
          console.log(`[Messages] ✅ Message sent quickly (${requestDuration}ms), skipped "In progress..." status`);
        } else {
          console.log(`[Messages] ⏳ Message sent after ${requestDuration}ms, showed "In progress..." status`);
        }
        console.log(`[Messages] ⏸️ Waiting for server events to set status (not setting optimistically)`);
        
        // NOTE: Do NOT play sent sound here - wait for server's message:sent event
        // This ensures sound plays exactly once when server confirms the message was sent
        // The sound will be played in the onMessageSent handler below
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Clear any pending progress timer on error
      // Status will remain as "In progress..." if it was set, which is fine for error state
    } finally {
      setSending(false);
    }
  };

  // Optimized input handler with uncontrolled input and throttling
  // CRITICAL: Use uncontrolled input (ref) to prevent re-renders of message list/header
  // Input updates are handled natively by the DOM, not React state - zero re-renders on keystroke
  const handleInputChange = useCallback(() => {
    // Input is uncontrolled - no state update needed, DOM handles it natively
    // This prevents re-renders of the entire component tree on every keystroke
    
    // Track input frame time for metrics (async, non-blocking, background task)
    // Use requestIdleCallback for better performance, fallback to setTimeout
    const inputStartTime = performance.now();
    const scheduleAsync = typeof requestIdleCallback !== 'undefined' 
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 100 })
      : (cb: () => void) => setTimeout(cb, 0);
    
    scheduleAsync(() => {
      const inputFrameTime = performance.now() - inputStartTime;
      typingMetricsRef.current.inputFrameTimes.push(inputFrameTime);
      // Keep only last 100 frame times
      if (typingMetricsRef.current.inputFrameTimes.length > 100) {
        typingMetricsRef.current.inputFrameTimes.shift();
      }
    });
    
    if (!selectedConversation || !sendTyping || !isConnected) return;
    
    const convId = selectedConversation._id;
    const now = Date.now();
    const TYPING_THROTTLE_MS = 400; // Throttle emits to max 1 per 400ms (optimized for smooth typing)
    const TYPING_IDLE_MS = 500; // Send typing:stop after 500ms of inactivity (debounced)
    
    // Clear existing stop timeout
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    
    // If this is the first keystroke, emit typing:start immediately
    if (!isTypingActiveRef.current) {
      isTypingActiveRef.current = true;
      lastTypingEmitRef.current = now;
      
      // Emit typing:start via socket.io immediately (first keystroke)
      sendTyping(convId, true);
      
      // Move metrics tracking to background (non-blocking, async)
      const scheduleAsync = typeof requestIdleCallback !== 'undefined' 
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 100 })
        : (cb: () => void) => setTimeout(cb, 0);
      scheduleAsync(() => {
        typingMetricsRef.current.emitCount++;
        typingMetricsRef.current.lastEmitTime = now;
      });
      
      // Schedule typing:stop after idle period
      typingStopTimeoutRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        sendTyping(convId, false);
        typingStopTimeoutRef.current = null;
      }, TYPING_IDLE_MS);
    } else {
      // Throttle subsequent emits: only emit if enough time has passed
      const scheduleAsync = typeof requestIdleCallback !== 'undefined' 
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 100 })
        : (cb: () => void) => setTimeout(cb, 0);
      
      if (now - lastTypingEmitRef.current >= TYPING_THROTTLE_MS) {
        lastTypingEmitRef.current = now;
        
        // Emit typing update via socket.io (throttled)
        sendTyping(convId, true);
        
        // Move metrics tracking to background (non-blocking, async)
        scheduleAsync(() => {
          typingMetricsRef.current.emitCount++;
          typingMetricsRef.current.lastEmitTime = now;
        });
      } else {
        // Schedule throttled emit
        if (typingThrottleTimerRef.current) {
          clearTimeout(typingThrottleTimerRef.current);
        }
        const delay = TYPING_THROTTLE_MS - (now - lastTypingEmitRef.current);
        typingThrottleTimerRef.current = setTimeout(() => {
          const emitTime = Date.now();
          lastTypingEmitRef.current = emitTime;
          
          // Emit typing update
          sendTyping(convId, true);
          
          // Move metrics tracking to background (non-blocking, async)
          scheduleAsync(() => {
            typingMetricsRef.current.emitCount++;
            typingMetricsRef.current.lastEmitTime = emitTime;
          });
          
          typingThrottleTimerRef.current = null;
        }, delay);
      }
      
      // Reset stop timeout on each keystroke
      typingStopTimeoutRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        sendTyping(convId, false);
        typingStopTimeoutRef.current = null;
      }, TYPING_IDLE_MS);
    }
  }, [selectedConversation, sendTyping, isConnected]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Header menu action handlers
  const handleViewProfile = useCallback((userId: string) => {
    navigate(`/app/profile/${userId}`);
  }, [navigate]);


  // Chat grouping helpers
  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const formatClock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const formatDayLabel = (d: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(d, today)) return 'Today';
    if (isSameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  };

  // Memoize filtered conversations to avoid re-filtering on every render
  const filteredConversations = useMemo(() => {
    if (!searchTerm) return conversations;
    const lowerSearch = searchTerm.toLowerCase();
    return conversations.filter(conv => {
    const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
      return other?.name.toLowerCase().includes(lowerSearch);
  });
  }, [conversations, searchTerm, user?._id]);


  const renderedMessages = useMemo(() => {
    return Array.from(new Map(messages.map(m => [m._id + '-' + m.createdAt, m])).values());
  }, [messages]);

  const lastOwnIndex = useMemo(() => {
    for (let i = renderedMessages.length - 1; i >= 0; i--) {
      if (renderedMessages[i].sender._id === user?._id) return i;
    }
    return -1;
  }, [renderedMessages, user?._id]);

  // Memoize otherUser to avoid recalculation
  const otherUserMemo = useMemo(() => {
    const other =
      selectedConversation?.otherParticipant ||
    selectedConversation?.participants.find(p => p._id !== user?._id);
    return other ?? null;
  }, [selectedConversation, user?._id]);

  // State for mute duration modal
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [muteConversationId, setMuteConversationId] = useState<string | null>(null);

  const handleMuteConversation = useCallback(async (conversationId: string, mute: boolean, durationMinutes: number | null = null) => {
    try {
      console.log('[Messages] Muting conversation:', { conversationId, mute, durationMinutes });
      const response = await axios.post(`/messages/conversations/${conversationId}/mute`, { 
        mute,
        durationMinutes: mute ? durationMinutes : undefined 
      });
      console.log('[Messages] Mute response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to mute conversation');
      }
      
      const isMuted = typeof response?.data?.isMuted === 'boolean' ? response.data.isMuted : mute;
      const mutedUntil = response?.data?.mutedUntil ? new Date(response.data.mutedUntil).toISOString() : (isMuted ? null : undefined);

      setConversations(prev => prev.map(conv => (
        conv._id === conversationId
          ? { ...conv, isMuted, mutedUntil }
          : conv
      )));

      setSelectedConversation(prev => {
        if (prev && prev._id === conversationId) {
          return { ...prev, isMuted, mutedUntil };
        }
        return prev;
      });

      const other = otherUserMemo;
      if (isMuted) {
        const durationText = durationMinutes === null 
          ? 'until you unmute it' 
          : durationMinutes === 15 
            ? 'for 15 minutes'
            : durationMinutes === 60
              ? 'for 1 hour'
              : durationMinutes === 480
                ? 'for 8 hours'
                : durationMinutes === 1440
                  ? 'for 24 hours'
                  : '';
        pushToast(
          `Conversation muted ${durationText}. You won't receive notifications during this time.`,
          {
            conversationId,
            senderName: other?.name ?? 'Conversation',
            senderAvatar: other?.profilePicture,
          }
        );
      } else {
        pushToast(
          'Conversation unmuted. Alerts are enabled again.',
          {
            conversationId,
            senderName: other?.name ?? 'Conversation',
            senderAvatar: other?.profilePicture,
          }
        );
      }
    } catch (error: any) {
      console.error('[Messages] Failed to mute conversation:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to update mute preference. Please try again.';
      pushToast(errorMessage, {
        conversationId,
        senderName: otherUserMemo?.name ?? 'Conversation',
        senderAvatar: otherUserMemo?.profilePicture,
      });
    }
  }, [otherUserMemo, pushToast]);

  // Handler to show mute modal (called from ChatHeader)
  const handleShowMuteModal = useCallback((conversationId: string) => {
    setMuteConversationId(conversationId);
    setShowMuteModal(true);
  }, []);

  // Handler for when user selects mute duration
  const handleMuteDurationSelected = useCallback((durationMinutes: number | null) => {
    if (muteConversationId) {
      handleMuteConversation(muteConversationId, true, durationMinutes);
      setMuteConversationId(null);
    }
    setShowMuteModal(false);
  }, [muteConversationId, handleMuteConversation]);

  // Handler to unmute directly (no modal needed)
  const handleUnmuteConversation = useCallback((conversationId: string) => {
    handleMuteConversation(conversationId, false);
  }, [handleMuteConversation]);

  const handleBlockUser = useCallback(async (userId: string) => {
    try {
      const conversationId = selectedConversation?._id;
      console.log('[Messages] Blocking user:', { userId, conversationId });
      const response = await axios.post(`/users/${userId}/block`, { block: true });
      console.log('[Messages] Block response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to block user');
      }

      pushToast('User blocked. You will no longer receive messages from them.', {
        conversationId: conversationId ?? '',
        senderName: otherUserMemo?.name ?? 'System',
        senderAvatar: otherUserMemo?.profilePicture,
      });

      if (conversationId) {
        setConversations(prev => prev.filter(conv => conv._id !== conversationId));
      } else {
        setConversations(prev => prev.filter(conv => conv.otherParticipant?._id !== userId));
      }

      setSelectedConversation(null);
      setMessages([]);
      await fetchConversations();
    } catch (error: any) {
      console.error('[Messages] Failed to block user:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to block user. Please try again.';
      pushToast(errorMessage, {
        conversationId: selectedConversation?._id ?? '',
        senderName: otherUserMemo?.name ?? 'System',
        senderAvatar: otherUserMemo?.profilePicture,
      });
    }
  }, [fetchConversations, otherUserMemo, pushToast, selectedConversation]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      console.log('[Messages] Deleting conversation:', conversationId);
      const response = await axios.delete(`/messages/conversations/${conversationId}`);
      console.log('[Messages] Delete response:', response.data);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete conversation');
      }
      
      const other = otherUserMemo;
      pushToast('Conversation deleted successfully.', {
        conversationId,
        senderName: other?.name ?? 'System',
        senderAvatar: other?.profilePicture,
      });
      
      // Clear selected conversation and refresh list
      setSelectedConversation(null);
      setMessages([]);
      await fetchConversations();
    } catch (error: any) {
      console.error('[Messages] Failed to delete conversation:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete conversation. Please try again.';
      pushToast(errorMessage, {
        conversationId,
        senderName: otherUserMemo?.name ?? 'System',
        senderAvatar: otherUserMemo?.profilePicture,
      });
    }
  }, [fetchConversations, otherUserMemo, pushToast]);

  const handleReport = useCallback(async (userId: string) => {
    try {
      const conversationId = selectedConversation?._id ?? '';
      await axios.post(`/users/${userId}/report`, {
        reason: 'messages_chat_header',
        details: 'User reported from the Messages conversation header',
      });
      pushToast('Report submitted. Our team will review it shortly.', {
        conversationId,
        senderName: otherUserMemo?.name ?? 'System',
        senderAvatar: otherUserMemo?.profilePicture,
      });
    } catch (error) {
      console.error('[Messages] Failed to report user:', error);
      pushToast('Failed to submit report. Please try again later.', {
        conversationId: selectedConversation?._id ?? '',
        senderName: otherUserMemo?.name ?? 'System',
        senderAvatar: otherUserMemo?.profilePicture,
      });
    }
  }, [otherUserMemo, pushToast, selectedConversation]);

  // Memoize seenBy checks to avoid repeated array operations
  // This cache tracks which of OUR messages have been read by the OTHER participant
  const seenByCache = useMemo(() => {
    const cache = new Map<string, boolean>();
    const userId = user?._id?.toString() || String(user?._id || '');
    
    // Get the other participant ID for this conversation
    const otherParticipantId = otherUserMemo?._id?.toString() || String(otherUserMemo?._id || '');
    
    if (!otherParticipantId) return cache;
    
    renderedMessages.forEach((msg, index) => {
      const msgSenderId = msg.sender._id?.toString() || String(msg.sender._id || '');
      const isOurMessage = msgSenderId === userId;
      
      if (isOurMessage && msg.seenBy && Array.isArray(msg.seenBy)) {
        // Check if the OTHER participant (recipient) has read this message
        const isReadByOther = msg.seenBy.some((id: any) => {
          let idStr: string;
          if (typeof id === 'string') {
            idStr = id;
          } else if (id && typeof id === 'object' && 'toString' in id) {
            idStr = id.toString();
          } else {
            idStr = String(id);
          }
          return idStr === otherParticipantId;
        });
        
        cache.set(`${msg._id}-${index}`, isReadByOther);
      }
    });
    return cache;
  }, [renderedMessages, user?._id, otherUserMemo?._id]);

  // Memoize event handlers to prevent recreating functions on every render
  const handleMessageClick = useCallback((messageId: string) => {
    // CRITICAL: Only one chat bubble should be active at a time
    // If clicking the same bubble, toggle it off (unclick)
    // If clicking a different bubble, clear all previous selections and activate the new one
    setStickyTimes(prev => {
      const isCurrentlyClicked = prev.has(messageId);
      if (isCurrentlyClicked) {
        // Toggle off: remove this message from clicked set
        const n = new Set(prev);
        n.delete(messageId);
        return n;
      } else {
        // Toggle on: clear all previous selections and add this one
        // Only one bubble should be active at a time
        return new Set([messageId]);
      }
    });
    
    // When a read message is clicked, toggle "Read" text visibility
    // Check if this message is read by looking at the messages array
    const message = messages.find(m => m._id === messageId);
    if (message && message.sender._id === user?._id && message.seenBy && Array.isArray(message.seenBy)) {
      const otherParticipantId = otherUserMemo?._id?.toString();
      if (otherParticipantId) {
        const isReadByOther = message.seenBy.some((id: any) => {
          let idStr: string;
          if (typeof id === 'string') {
            idStr = id;
          } else if (id && typeof id === 'object' && 'toString' in id) {
            idStr = id.toString();
          } else {
            idStr = String(id);
          }
          return idStr === otherParticipantId;
        });
        if (isReadByOther) {
          setReadVisible(prev => {
            const isCurrentlyVisible = prev.has(messageId);
            if (isCurrentlyVisible) {
              // Toggle off: remove this message from readVisible set
              const n = new Set(prev);
              n.delete(messageId);
              return n;
            } else {
              // Toggle on: clear all previous selections and add this one
              // Only one bubble should show "Read" text at a time
              return new Set([messageId]);
            }
          });
        } else {
          // If message is not read by other, clear readVisible for this message
          setReadVisible(prev => {
            const n = new Set(prev);
            n.delete(messageId);
            return n;
          });
        }
      }
    } else {
      // If message is not own message or not read, clear readVisible for this message
      setReadVisible(prev => {
        const n = new Set(prev);
        n.delete(messageId);
        return n;
      });
    }
  }, [messages, user?._id, otherUserMemo?._id]);

  // Memoize the entire message list JSX to prevent re-rendering on input changes
  const messageListJSX = useMemo(() => {
    // Calculate lastSeenIndex once using cached values
    let lastSeenIndex = -1;
    const userId = user?._id || '';
    for (let i = renderedMessages.length - 1; i >= 0; i--) {
      if (renderedMessages[i].sender._id === userId) {
        const cacheKey = `${renderedMessages[i]._id}-${i}`;
        if (seenByCache.get(cacheKey)) {
          lastSeenIndex = i;
          break;
        }
      }
    }
    
    return renderedMessages.map((message, index) => {
      const isOwn = message.sender._id === user?._id;
      const isLastSeen = isOwn && lastSeenIndex === index;
      const cacheKey = `${message._id}-${index}`;
      const isSeenByOther = isOwn ? (seenByCache.get(cacheKey) || false) : false;

      // Message state logic
      const isLatestOwn = isOwn && index === lastOwnIndex;
      const isClicked = stickyTimes.has(message._id);
      const isReadVisible = readVisible.has(message._id); // Check if "Read" text should be visible
      
      // CRITICAL: Conditions must be mutually exclusive to prevent duplicate status displays
      // Priority order: 1) Most recent + last-read, 2) Most recent (not last-read), 3) Last-read (not most recent), 4) Other clicked
      
      // Most recent message that is also last-read: No status text by default, show only when clicked
      const isMostRecentAndLastRead = isOwn && isLatestOwn && isLastSeen;
      // Most recent message (not last-read): Always show status text only
      const shouldShowStatusTextOnMostRecent = isOwn && isLatestOwn && !isLastSeen;
      // Last-read message (if different from most recent): Show tiny profile picture always, status when clicked
      const shouldShowReadIndicatorOnLastRead = isOwn && isSeenByOther && isLastSeen && !isLatestOwn;
      // Other messages: Show status text only when clicked (EXCLUDE messages already handled by shouldShowReadIndicatorOnLastRead)
      const shouldShowStatusTextOnOthers = isOwn && !isLatestOwn && isClicked && !shouldShowReadIndicatorOnLastRead;
      
      // Determine current status for display - SINGLE SOURCE OF TRUTH
      // CRITICAL: Use getHighestStatus to find the highest status across ALL sources
      // This ensures we always show the most advanced status and skip intermediate ones
      let currentStatus: string;
      
      if (isOwn) {
        // Get the highest status across all sources (renderedStatus, messageStatus, bufferedStatusRef, message object)
        const highestStatus = getHighestStatus(message._id, message);
        
        if (highestStatus) {
          // CRITICAL: Never show "In progress..." if message has a real ID (not temp)
          // Real messages should never show "In progress..." - only temp messages during upload
          if (highestStatus === 'In progress...' && !message._id.startsWith('temp-')) {
            // Skip "In progress..." for real messages, check if message is delivered or read
            if (isSeenByOther) {
              currentStatus = 'Read';
            } else if (message.deliveredTo && Array.isArray(message.deliveredTo) && message.deliveredTo.length > 0) {
              currentStatus = 'Delivered';
            } else {
              currentStatus = 'Sent';
            }
          } else {
            currentStatus = highestStatus;
          }
        } else {
          // No status found in any source - determine from message object
          if (isSeenByOther) {
            // Message is read by recipient - status is ALWAYS "Read" (highest priority)
            currentStatus = 'Read';
          } else if (message.deliveredTo && Array.isArray(message.deliveredTo) && message.deliveredTo.length > 0) {
            // Message is delivered but not read
            currentStatus = 'Delivered';
          } else {
            // Message is sent but not delivered yet
            currentStatus = 'Sent';
          }
        }
      } else {
        // For messages from others, no status to show
        currentStatus = '';
      }
      
      // Visibility rules for status display:
      // CRITICAL: Only show status if it's the highest available status
      // Skip intermediate statuses if a higher one is already available
      // 1. "In Progress..." - only while sending (temp messages)
      // 2. "Sent" - only if not yet delivered or read (hide if "Delivered" or "Read" is available)
      // 3. "Delivered" - only if delivered but not read (hide if "Read" is available)
      // 4. "Read" - internal status, only show when clicked
      let shouldShowStatus = false;
      if (isOwn && currentStatus) {
        // Get the highest status to determine if we should show the current status
        const highestAvailableStatus = getHighestStatus(message._id, message);
        const currentStatusPriority = getStatusPriority(currentStatus);
        const highestAvailablePriority = getStatusPriority(highestAvailableStatus || '');
        
        // Only show status if it matches the highest available status
        // This ensures we skip intermediate statuses and only show the final state
        const isHighestStatus = currentStatus === highestAvailableStatus || currentStatusPriority === highestAvailablePriority;
        
        if (currentStatus === 'In progress...') {
          // Show "In progress..." only for temp messages (while sending) AND message hasn't been sent yet
          // AND it's the highest available status
          shouldShowStatus = message._id.startsWith('temp-') && !sentMessagesRef.current.has(message._id) && isHighestStatus;
        } else if (currentStatus === 'Sent') {
          // Show "Sent" only if it's the highest available status (not delivered or read)
          shouldShowStatus = isHighestStatus && !isSeenByOther && 
                            !(message.deliveredTo && Array.isArray(message.deliveredTo) && message.deliveredTo.length > 0);
        } else if (currentStatus === 'Delivered') {
          // Show "Delivered" only if it's the highest available status (not read)
          shouldShowStatus = isHighestStatus && !isSeenByOther;
        } else if (currentStatus === 'Read') {
          // Read status is internal - only show when clicked
          shouldShowStatus = isHighestStatus && (isReadVisible || isClicked);
        }
        
        // Override: Show status on most recent message (if not last-read) if status is needed
        // OR show when clicked (for other messages or read status)
        if (shouldShowStatusTextOnMostRecent && shouldShowStatus) {
          // Most recent message: show status if it's needed (not hidden by higher priority)
        } else if (shouldShowStatusTextOnOthers || isClicked) {
          // Other messages or clicked: show status when clicked (but only if it's the highest)
          shouldShowStatus = isHighestStatus;
        }
      }
      
      // Only animate "In progress..." status, not intermediate statuses (Sent/Delivered/Read)
      // This prevents flicker from rapid status changes
      const isSending = currentStatus.toLowerCase().includes('progress');

      const currentDate = new Date(message.createdAt);
      const prev = index > 0 ? messages[index - 1] : null;
      const prevDate = prev ? new Date(prev.createdAt) : null;
      const showDateDivider = !prevDate || !isSameDay(currentDate, prevDate);
      let gapClass = 'mt-1';
      if (!showDateDivider && prev && prev.sender._id === message.sender._id) {
        const gapMinutes = Math.floor((currentDate.getTime() - prevDate.getTime()) / 60000);
        if (gapMinutes <= 2) gapClass = 'mt-1';
        else if (gapMinutes <= 5) gapClass = 'mt-3';
        else gapClass = 'mt-4';
      } else if (!showDateDivider && prev && prev.sender._id !== message.sender._id) {
        gapClass = 'mt-3';
      } else {
        gapClass = 'mt-6';
      }

      return (
        <React.Fragment key={message._id + '-' + message.createdAt}>
          {showDateDivider && (
            <div className="my-4 flex items-center justify-center">
              <span className="px-3 py-1 text-xs text-gray-500 bg-gray-100 rounded-full">
                {formatDayLabel(currentDate)}
              </span>
            </div>
          )}
          <div className={`${gapClass} flex ${isOwn ? 'justify-end' : 'justify-start'}`}> 
            <div 
              id={`message-${message._id}`}
              className={`relative group flex items-end gap-2 max-w-[85%] md:max-w-[80%] lg:max-w-[65%] xl:max-w-[60%] ${isOwn ? 'flex-row-reverse' : ''}`}
              onClick={() => handleMessageClick(message._id)}
            >
              {/* Their avatar for messages from others only */}
              {!isOwn && (
                <img
                  src={getProfileImageUrl(message.sender.profilePicture) || '/default-avatar.png'}
                  alt={message.sender.name}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
              )}
              {/* Message bubble */}
              <div className="relative" style={{ minHeight: '36px' }}>
                {/* Layout-stable bubble: fixed min dimensions prevent reflow during status updates */}
                <div 
                  className={`rounded-lg px-3 py-2 max-w-full ${isOwn ? (isSending ? 'bg-primary-500 animate-pulse text-white' : 'bg-primary-600 text-white') : 'bg-gray-100 text-secondary-900'}`} 
                  style={{ 
                    minWidth: '64px',
                    minHeight: '36px',
                    display: 'inline-block',
                    transition: 'none' // Disable transitions to prevent jumps
                  }}
                > 
                  <p className="text-sm whitespace-pre-wrap break-words break-all">
                    {message.content}
                  </p>
                  {/* Timestamp under message content, aligned right */}
                  <div className={`mt-1 text-[11px] ${isOwn ? 'text-primary-100' : 'text-gray-500'} text-right`}>
                    {formatClock(currentDate)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Most recent message that is also last-read: No status text by default, show status + tiny avatar when clicked */}
          {isMostRecentAndLastRead && (
            <div className={`w-full flex ${isOwn ? 'justify-end' : 'justify-start'}`}> 
              <div className="flex flex-col items-end">
                {/* CRITICAL: Use currentStatus as single source of truth */}
                {/* Show status text only when clicked (isReadVisible) */}
                {/* For read messages, currentStatus is already "Read" (from status determination logic) */}
                {isReadVisible && (
                  <span 
                    className={`block text-xs mt-0.5 ${isSending ? 'animate-pulse text-primary-500 font-bold' : 'text-gray-400'}`} 
                    style={{ 
                      minWidth: '80px', 
                      maxWidth: '80px',
                      height: '16px',
                      textAlign: 'right',
                      display: 'inline-block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: '16px',
                      transition: 'none' // Disable transitions to prevent jumps
                    }}
                  >
                    {currentStatus}
                  </span>
                )}
                {/* Tiny avatar always visible for read messages */}
                {otherUserMemo?.profilePicture && (
                  <img
                    key={`read-indicator-${message._id}`}
                    src={getProfileImageUrl(otherUserMemo.profilePicture) || '/default-avatar.png'}
                    alt={otherUserMemo.name}
                    className="w-4 h-4 rounded-full border border-gray-300 shadow-sm mt-0.5"
                    title={`${otherUserMemo.name} has read this message`}
                    style={{ flexShrink: 0 }} // Prevent avatar from causing layout shifts
                  />
                )}
              </div>
            </div>
          )}
          {/* Most recent message (not last-read): Status text only */}
          {shouldShowStatusTextOnMostRecent && (
            <div className={`w-full flex ${isOwn ? 'justify-end' : 'justify-start'}`}> 
              <div className="flex flex-col items-end">
                {/* Layout-stable status display: fixed dimensions prevent reflow/jumps */}
                <span 
                  className={`block text-xs mt-0.5 ${isSending ? 'animate-pulse text-primary-500 font-bold' : 'text-gray-400'}`} 
                  style={{ 
                    minWidth: '80px', 
                    maxWidth: '80px',
                    height: '16px',
                    textAlign: 'right',
                    display: 'inline-block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: '16px',
                    transition: 'none' // Disable transitions to prevent jumps
                  }}
                >
                  {currentStatus}
                </span>
              </div>
            </div>
          )}
          {/* Other messages: Status text only when clicked */}
          {shouldShowStatusTextOnOthers && (
            <div className={`w-full flex ${isOwn ? 'justify-end' : 'justify-start'}`}> 
              <div className="flex flex-col items-end">
                {/* CRITICAL: Use currentStatus as single source of truth */}
                {/* For read messages, currentStatus is already "Read" (from status determination logic) */}
                {/* For non-read messages, currentStatus is "Sent", "Delivered", etc. */}
                {/* Since this block only renders when clicked, show the status */}
                {/* Layout-stable status display: fixed dimensions prevent reflow/jumps */}
                <span 
                  className={`block text-xs mt-0.5 ${isSending ? 'animate-pulse text-primary-500 font-bold' : 'text-gray-400'}`} 
                  style={{ 
                    minWidth: '80px', 
                    maxWidth: '80px',
                    height: '16px',
                    textAlign: 'right',
                    display: 'inline-block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: '16px',
                    transition: 'none' // Disable transitions to prevent jumps
                  }}
                >
                  {currentStatus}
                </span>
              </div>
            </div>
          )}
          {/* Last-read message (if different from most recent): Tiny profile picture always, status when clicked (only if Read) */}
          {shouldShowReadIndicatorOnLastRead && currentStatus === 'Read' && (
            <div className={`w-full flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col items-end">
                {/* CRITICAL: Use currentStatus as single source of truth */}
                {/* Show status text only when clicked (isReadVisible) */}
                {/* For read messages, currentStatus is already "Read" (from status determination logic) */}
                {isReadVisible && (
                  <span 
                    className={`block text-xs mt-0.5 ${isSending ? 'animate-pulse text-primary-500 font-bold' : 'text-gray-400'}`} 
                    style={{ 
                      minWidth: '80px', 
                      maxWidth: '80px',
                      height: '16px',
                      textAlign: 'right',
                      display: 'inline-block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: '16px',
                      transition: 'none' // Disable transitions to prevent jumps
                    }}
                  >
                    {currentStatus}
                  </span>
                )}
                {/* Tiny avatar always visible for read messages */}
                {otherUserMemo?.profilePicture && (
                  <img
                    key={`read-indicator-${message._id}`}
                    src={getProfileImageUrl(otherUserMemo.profilePicture) || '/default-avatar.png'}
                    alt={otherUserMemo.name}
                    className="w-4 h-4 rounded-full border border-gray-300 shadow-sm mt-0.5"
                    title={`${otherUserMemo.name} has read this message`}
                    style={{ flexShrink: 0 }} // Prevent avatar from causing layout shifts
                  />
                )}
              </div>
            </div>
          )}
        </React.Fragment>
      );
    });
  }, [renderedMessages, seenByCache, lastOwnIndex, stickyTimes, renderedStatus, messageStatus, messages, otherUserMemo, user?._id, readVisible, handleMessageClick, getHighestStatus, getStatusPriority]);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-gray-50">
      {/* Conversations List */}
      <div className="w-full md:w-[340px] lg:w-[380px] bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-secondary-900 mb-4">Messages</h2>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchTerm ? 'No conversations found' : 'No messages yet'}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isRoom = conv.isRoom && conv.roomId;
              const other = conv.otherParticipant || conv.participants.find(p => p._id !== user?._id);
              const isSelected = selectedConversation?._id === conv._id;
              
              // Room status badge color
              const getRoomStatusColor = (status?: string) => {
                switch (status) {
                  case 'Active': return 'bg-green-100 text-green-700';
                  case 'Completed': return 'bg-gray-100 text-gray-700';
                  case 'Cancelled': return 'bg-red-100 text-red-700';
                  default: return 'bg-gray-100 text-gray-700';
                }
              };

              return (
                <div
                  key={conv._id}
                  id={`conversation-${conv._id}`}
                  onClick={() => handleSelectConversation(conv)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isSelected && !isRoom ? 'bg-primary-50 border-l-4 border-l-primary-600' : ''
                  } ${isRoom ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {isRoom ? (
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <UserGroupIcon className="h-6 w-6 text-blue-600" />
                        </div>
                      ) : (
                        <>
                          <img
                            src={getProfileImageUrl(other?.profilePicture) || '/default-avatar.png'}
                            alt={other?.name}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                          <UserStatusBadge 
                            userId={other?._id || ''} 
                            showText={false}
                            glow
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-white"
                          />
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-secondary-900 truncate">
                            {isRoom ? conv.roomName || 'Room' : other?.name}
                          </h3>
                          {isRoom && conv.roomStatus && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${getRoomStatusColor(conv.roomStatus)}`}>
                              {conv.roomStatus}
                            </span>
                          )}
                        </div>
                        {conv.lastMessage && (
                          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                            {formatTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-gray-600 truncate flex-1">
                          {conv.lastMessage?.content || 'No messages yet'}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {conv.isMuted && (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                              title="Notifications silenced — you'll still see unread messages in your Inbox."
                            >
                              <BellSlashIcon className="h-3 w-3" />
                              <span>Muted</span>
                            </span>
                          )}
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary-600 text-white text-xs font-medium rounded-full px-2 py-0.5">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Thread */}
      <div className="hidden md:flex flex-1 flex-col bg-white">
        {selectedConversation ? (
          <>
            {/* Header - Memoized to prevent re-renders on input changes */}
            <ChatHeader
              otherUser={otherUserMemo}
              isOtherTyping={isOtherTyping}
              otherTypingName={otherTypingName}
              conversationId={selectedConversation._id}
              isMuted={selectedConversation.isMuted ?? false}
              onViewProfile={handleViewProfile}
              onMuteConversation={handleMuteConversation}
              onShowMuteModal={handleShowMuteModal}
              onUnmuteConversation={handleUnmuteConversation}
              onBlockUser={handleBlockUser}
              onDeleteConversation={handleDeleteConversation}
              onReport={handleReport}
            />

            {/* Messages - Scrollable area */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="min-h-full flex flex-col justify-end">
                {messageListJSX}
              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Typing indicator - Fixed above input, outside scrollable area */}
            <div className="shrink-0 flex items-center px-4 py-1 min-h-[20px]">
                  <TypingIndicator userName={otherTypingName || 'User'} isVisible={isOtherTyping} />
            </div>

            {/* Input - Fixed at bottom */}
            <form onSubmit={sendMessage} className="shrink-0 p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  ref={messageInputRef}
                  type="text"
                  defaultValue=""
                  onChange={handleInputChange}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => {
              const targetConv = conversations.find(c => c._id === toast.conversationId);
              if (targetConv) {
                setSelectedConversation(targetConv);
                setToasts(prev => prev.filter(t => t.id !== toast.id));
              }
            }}
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[300px] max-w-[400px] cursor-pointer hover:shadow-xl transition-shadow flex items-start gap-3"
          >
            <img
              src={getProfileImageUrl(toast.senderAvatar) || '/default-avatar.png'}
              alt={toast.senderName}
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{toast.senderName}</p>
              <p className="text-sm text-gray-600 truncate">{toast.message}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToasts(prev => prev.filter(t => t.id !== toast.id));
              }}
              className="p-1 hover:bg-gray-100 rounded-full flex-shrink-0"
            >
              <XMarkIcon className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        ))}
      </div>

      {/* Mute Duration Modal */}
      <MuteDurationModal
        isOpen={showMuteModal}
        onClose={() => {
          setShowMuteModal(false);
          setMuteConversationId(null);
        }}
        onSelectDuration={handleMuteDurationSelected}
        conversationName={otherUserMemo?.name || 'this conversation'}
      />
    </div>
  );
};

export default Messages;

