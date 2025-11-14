const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config({ path: './config.env' });

// Initialize Passport
const passport = require('./config/passport');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const roomRoutes = require('./routes/rooms');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const collaborationRoutes = require('./routes/collaboration');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// Import models
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

const app = express();
const server = createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: [process.env.CLIENT_URL || "http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

// Make io accessible in routes
app.set('io', io);

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs (increased for development)
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
// Ensure CORS headers are present even on errors (e.g., 429)
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
}));
app.options('*', cors());
// Apply rate limiter after CORS so blocked responses still include CORS headers
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from uploads directory
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res) => {
      // Allow images to load from a different origin (localhost:3000)
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    },
  })
);


// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collabrium', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Debug middleware to log all API requests
app.use('/api', (req, res, next) => {
  console.log(`[API Request] ${req.method} ${req.path}`, {
    body: req.body,
    params: req.params,
    query: req.query
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/collaboration', collaborationRoutes);

// Store active user sessions for presence tracking
const activeUsers = new Map(); // Map<userId, { sockets: Set<socketId>, status: 'online'|'away', lastSeen: Date }>

// Delivery Buffer Configuration
const DELIVERED_BUFFER_MS = (() => {
  const MIN_DELAY_MS = 100; // Reduced minimum for faster Sent → Delivered transitions
  const MAX_DELAY_MS = 1000;
  const DEFAULT_DELAY_MS = 150; // Reduced from 500ms to 150ms for faster, more responsive UX
  
  // Priority order:
  // 1. process.env.DELIVERED_BUFFER_MS (env var)
  // 2. Default (150ms - reduced from 500ms for faster transitions)
  
  const envValue = process.env.DELIVERED_BUFFER_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed >= MIN_DELAY_MS && parsed <= MAX_DELAY_MS) {
      console.log(`[DeliveryBuffer] Using buffer delay from DELIVERED_BUFFER_MS: ${parsed}ms`);
      return parsed;
    } else if (!isNaN(parsed)) {
      console.warn(`[DeliveryBuffer] DELIVERED_BUFFER_MS value ${parsed}ms is outside valid range (${MIN_DELAY_MS}-${MAX_DELAY_MS}ms), using default ${DEFAULT_DELAY_MS}ms`);
    }
  }
  
  console.log(`[DeliveryBuffer] Using default buffer delay: ${DEFAULT_DELAY_MS}ms`);
  return DEFAULT_DELAY_MS;
})();

/**
 * Delivery Buffer Manager
 * Buffers and coalesces delivery acknowledgements to prevent UI flicker
 */
class DeliveryBuffer {
  constructor(bufferDelayMs = DELIVERED_BUFFER_MS) {
    this.bufferDelayMs = bufferDelayMs;
    this.pendingDeliveries = new Map(); // messageId -> { timer, payload, deviceId, statusSeq, timestamp }
    this.metrics = {
      totalDeliveries: 0,
      bufferedDeliveries: 0,
      immediateDeliveries: 0,
      duplicateDeliveries: 0,
      emitLatencies: [],
      dedupCount: 0,
    };
  }

  /**
   * Buffer a delivery acknowledgement
   * @param {Object} payload - { conversationId, messageId, senderId, recipientId, deviceId?, statusSeq?, timestamp }
   * @param {Function} emitFn - Function to emit the delivered event
   * @param {boolean} isUrgent - If true, bypass buffer
   */
  bufferDelivery(payload, emitFn, isUrgent = false) {
    const { messageId, recipientId, deviceId } = payload;
    
    this.metrics.totalDeliveries++;
    
    // Check for duplicates by messageId + deviceId + recipientId combination
    // We use messageId as the key, but check deviceId and recipientId for true duplicates
    const existing = this.pendingDeliveries.get(messageId);
    if (existing) {
      // Check if this is a duplicate from the same device and recipient
      if (existing.deviceId === (deviceId || 'default') && existing.recipientId === recipientId) {
        this.metrics.duplicateDeliveries++;
        this.metrics.dedupCount++;
        console.log(`[DeliveryBuffer] ⏭️ Duplicate delivery ACK detected (messageId: ${messageId}, deviceId: ${deviceId || 'default'}, recipientId: ${recipientId}), skipping`);
        return;
      }
      
      // If new delivery has higher status_seq, replace the pending one
      const existingSeq = existing.statusSeq || 2;
      const newSeq = payload.statusSeq || 2;
      if (newSeq > existingSeq) {
        console.log(`[DeliveryBuffer] 🔄 Replacing pending delivery with higher seq (${existingSeq} → ${newSeq}) for messageId: ${messageId}`);
        clearTimeout(existing.timer);
        this.pendingDeliveries.delete(messageId);
      } else if (newSeq < existingSeq) {
        // Stale event, ignore
        this.metrics.duplicateDeliveries++;
        this.metrics.dedupCount++;
        console.log(`[DeliveryBuffer] ⏭️ Ignoring stale delivery (seq ${newSeq} < ${existingSeq}) for messageId: ${messageId}`);
        return;
      }
    }
    
    // If urgent, emit immediately
    if (isUrgent) {
      this.metrics.immediateDeliveries++;
      const emitStartTime = Date.now();
      emitFn();
      const emitLatency = Date.now() - emitStartTime;
      this.metrics.emitLatencies.push(emitLatency);
      console.log(`[DeliveryBuffer] ⚡ Immediate delivery (urgent) for messageId: ${messageId}`);
      return;
    }
    
    // Buffer the delivery
    const bufferStartTime = Date.now();
    const timer = setTimeout(() => {
      const emitStartTime = Date.now();
      const bufferedPayload = this.pendingDeliveries.get(messageId);
      if (bufferedPayload) {
        // Emit with latest status_seq
        emitFn();
        const emitLatency = Date.now() - emitStartTime;
        const bufferLatency = Date.now() - bufferStartTime;
        this.metrics.emitLatencies.push(emitLatency);
        
        // Keep only last 100 latency measurements
        if (this.metrics.emitLatencies.length > 100) {
          this.metrics.emitLatencies.shift();
        }
        
        this.pendingDeliveries.delete(messageId);
        this.metrics.bufferedDeliveries++;
        
        console.log(`[DeliveryBuffer] ✅ Emitted buffered delivery (messageId: ${messageId}, bufferLatency: ${bufferLatency}ms, emitLatency: ${emitLatency}ms)`);
      }
    }, this.bufferDelayMs);
    
    this.pendingDeliveries.set(messageId, {
      timer,
      payload,
      deviceId: deviceId || 'default',
      recipientId,
      statusSeq: payload.statusSeq || 2,
      timestamp: payload.timestamp || new Date().toISOString(),
      bufferStartTime,
    });
    
    console.log(`[DeliveryBuffer] 📦 Buffering delivery (messageId: ${messageId}, delay: ${this.bufferDelayMs}ms)`);
  }

  /**
   * Get metrics
   */
  getMetrics() {
    const avgEmitLatency = this.metrics.emitLatencies.length > 0
      ? this.metrics.emitLatencies.reduce((a, b) => a + b, 0) / this.metrics.emitLatencies.length
      : 0;
    
    const dedupRate = this.metrics.totalDeliveries > 0
      ? (this.metrics.dedupCount / this.metrics.totalDeliveries) * 100
      : 0;
    
    return {
      delivered_emit_latency: {
        average: avgEmitLatency,
        min: this.metrics.emitLatencies.length > 0 ? Math.min(...this.metrics.emitLatencies) : 0,
        max: this.metrics.emitLatencies.length > 0 ? Math.max(...this.metrics.emitLatencies) : 0,
        recent: this.metrics.emitLatencies.slice(-10),
        all: this.metrics.emitLatencies,
      },
      delivered_dedup_rate: {
        percentage: parseFloat(dedupRate.toFixed(2)),
        duplicates: this.metrics.dedupCount,
        total: this.metrics.totalDeliveries,
      },
      buffered: this.metrics.bufferedDeliveries,
      immediate: this.metrics.immediateDeliveries,
      bufferDelay: this.bufferDelayMs,
      pendingCount: this.pendingDeliveries.size,
    };
  }

  /**
   * Clear all pending deliveries (for testing/reset)
   */
  clear() {
    this.pendingDeliveries.forEach(({ timer }) => clearTimeout(timer));
    this.pendingDeliveries.clear();
  }
}

// Create singleton delivery buffer instance
const deliveryBuffer = new DeliveryBuffer(DELIVERED_BUFFER_MS);

// Expose metrics endpoint (for monitoring)
app.get('/api/delivery-buffer/metrics', authenticateToken, (req, res) => {
  res.json(deliveryBuffer.getMetrics());
});

// Expose activeUsers for use in routes
app.locals.activeUsers = activeUsers;

// Typing indicator throttling/coalescing (server-side)
// Throttle typing events: max 1 broadcast per 300ms per (conversationId, userId)
const typingThrottleMap = new Map(); // Key: `${conversationId}:${userId}`, Value: { lastBroadcast: number, pendingTimeout: NodeJS.Timeout, userName: string }
const userNamesCache = new Map(); // Key: userId, Value: { name: string, cachedAt: number } - Cache user names for 5 minutes

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Extract userId from auth handshake
  const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
  
  if (userId) {
    // Track user session
    const isNewConnection = !activeUsers.has(userId);
    
    if (isNewConnection) {
      activeUsers.set(userId, {
        sockets: new Set([socket.id]),
        status: 'online',
        lastSeen: new Date()
      });
      console.log(`User ${userId} is now online (NEW CONNECTION)`);
      // Broadcast to all clients that this user came online
      io.emit('user-online', { userId, lastSeen: new Date().toISOString() });
      // Send list of currently online users to the new connection
      const onlineUserIds = Array.from(activeUsers.keys()).filter(id => id !== userId);
      socket.emit('online-users-list', onlineUserIds);
    } else {
      // User reconnecting (e.g., page refresh) - ensure they're marked as online
      const userData = activeUsers.get(userId);
      userData.sockets.add(socket.id);
      userData.lastSeen = new Date();
      // Always ensure user is online when reconnecting (unless explicitly away)
      const wasOffline = userData.status === 'offline';
      if (userData.status === 'away' || wasOffline) {
        userData.status = 'online';
        // Broadcast to all clients that user is now online
        io.emit('user-online', { userId, lastSeen: new Date().toISOString() });
      } else if (userData.status === 'online') {
        // If already online, still broadcast to ensure all clients are in sync
        io.emit('user-online', { userId, lastSeen: new Date().toISOString() });
      }
      console.log(`User ${userId} reconnected - ${userData.sockets.size} active sessions, status: ${userData.status}`);
      // Send updated online users list to the reconnecting client
      const onlineUserIds = Array.from(activeUsers.keys()).filter(id => id !== userId);
      socket.emit('online-users-list', onlineUserIds);
    }
    // Always join a per-user room for targeted emits
    const userRoom = `user:${userId}`;
    socket.join(userRoom);
    console.log(`[Socket] ✅ Socket ${socket.id} joined personal room ${userRoom} for user ${userId}`);
    
    // Handle offline-to-online delivery: mark previously undelivered messages as delivered
    // Use a small delay to ensure socket is fully connected and rooms are joined
    setTimeout(async () => {
      try {
        const conversations = await Conversation.find({ participants: userId });
        for (const conv of conversations) {
          const otherParticipant = conv.participants.find(p => p.toString() !== userId.toString());
          if (!otherParticipant) continue;
          
          // Find messages sent TO this user that haven't been delivered yet
          // Use simpler query: check if deliveredTo doesn't exist, is empty, or doesn't contain this userId
          const allMessages = await Message.find({
            conversation: conv._id,
            sender: otherParticipant
          }).limit(100);
          
          // Filter messages that haven't been delivered to this user
          const undeliveredMessages = allMessages.filter(msg => {
            if (!msg.deliveredTo || !Array.isArray(msg.deliveredTo) || msg.deliveredTo.length === 0) {
              return true; // Not delivered yet
            }
            return !msg.deliveredTo.some((d) => d.userId && d.userId.toString() === userId.toString());
          });
          
          // Mark each undelivered message as delivered and notify sender
          for (const msg of undeliveredMessages) {
            // Check if this user is already in deliveredTo to avoid duplicates
            const alreadyDelivered = msg.deliveredTo && msg.deliveredTo.some(
              (d) => d.userId.toString() === userId.toString()
            );
            
            if (!alreadyDelivered) {
              // Add to deliveredTo array
              msg.deliveredTo = msg.deliveredTo || [];
              msg.deliveredTo.push({
                userId: userId,
                deliveredAt: new Date()
              });
              await msg.save();
              
              // Notify the sender that their message has been delivered
              // Use delivery buffer for consistency (even for offline-to-online deliveries)
              const deliveredTimestamp = new Date().toISOString();
              const nodeId = process.env.NODE_ID || require('os').hostname() || 'single-instance';
              const emitDelivered = () => {
                io.to(`user:${otherParticipant.toString()}`).emit('message:delivered', {
                  conversationId: conv._id.toString(),
                  messageId: msg._id.toString(),
                  seq: 2, // Status sequence: Delivered = 2
                  timestamp: deliveredTimestamp,
                  nodeId: nodeId // Node ID for tie-breaking (when seq and timestamp are equal)
                });
              };
              
              // Buffer the delivery (offline-to-online deliveries also benefit from buffering)
              deliveryBuffer.bufferDelivery(
                {
                  conversationId: conv._id.toString(),
                  messageId: msg._id.toString(),
                  senderId: otherParticipant.toString(),
                  recipientId: userId.toString(),
                  deviceId: 'offline-to-online',
                  statusSeq: 2,
                  timestamp: deliveredTimestamp,
                },
                emitDelivered,
                false // Not urgent
              );
              
              console.log(`Message ${msg._id} delivered to ${userId} (offline-to-online) - buffering delivery`);
            }
          }
        }
      } catch (error) {
        console.error('Error processing offline-to-online message delivery:', error);
      }
    }, 200); // Small delay to ensure socket rooms are fully set up
    
    // Handle presence updates
    socket.on('update-presence', (data) => {
      if (activeUsers.has(userId)) {
        activeUsers.get(userId).lastSeen = new Date();
        activeUsers.get(userId).status = data.status || 'online';
        socket.broadcast.emit('user-status-update', { 
          userId, 
          status: data.status || 'online',
          lastSeen: new Date().toISOString()
        });
      }
    });
    
    // Handle heartbeat/ping
    socket.on('heartbeat', () => {
      if (activeUsers.has(userId)) {
        activeUsers.get(userId).lastSeen = new Date();
        // If user was away, mark them as online again
        if (activeUsers.get(userId).status === 'away') {
          activeUsers.get(userId).status = 'online';
          socket.broadcast.emit('user-online', { userId, lastSeen: new Date().toISOString() });
        }
      }
    });
  }

  // Join collaboration room (legacy)
  socket.on('join-room', (roomId) => {
    const roomName = `room:${roomId}`;
    socket.join(roomName);
    console.log(`[Socket] ✅ Socket ${socket.id} joined room: ${roomName}`);
  });

  // Leave collaboration room (legacy)
  socket.on('leave-room', (roomId) => {
    const roomName = `room:${roomId}`;
    socket.leave(roomName);
    console.log(`[Socket] ⚠️ Socket ${socket.id} left room: ${roomName}`);
  });

  // Join conversation room (for DMs / messages)
  socket.on('join-conversation', (conversationId) => {
    if (!conversationId) return;
    const roomName = `conversation:${conversationId}`;
    socket.join(roomName);
    console.log(`[Socket] ✅ Socket ${socket.id} joined conversation: ${roomName}`);
  });

  // Leave conversation room
  socket.on('leave-conversation', (conversationId) => {
    if (!conversationId) return;
    const roomName = `conversation:${conversationId}`;
    socket.leave(roomName);
    console.log(`[Socket] ⚠️ Socket ${socket.id} left conversation: ${roomName}`);
  });

  // Chat messages
  socket.on('send-message', (data) => {
    socket.to(data.roomId).emit('receive-message', data);
  });

  // Delivery receipts: recipient acknowledges receipt → notify sender(s) and persist delivery
  socket.on('message:received', async (payload) => {
    try {
      const { roomId, conversationId, messageId, senderId } = payload || {};
      const recipientId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
      
      // Prefer sending only to the sender's personal room when available
      const targetUserRoom = senderId ? `user:${senderId}` : undefined;
      const targetRoom = targetUserRoom || roomId || (conversationId ? `conversation:${conversationId}` : undefined);
      if (!targetRoom || !messageId) {
        console.warn('message:received missing targetRoom/messageId', payload);
        return;
      }
      
      // Mark message as delivered in database and check message age for optimization
      let messageAge = null;
      let isRecipientOnline = false;
      
      if (recipientId) {
        // Check if recipient is online
        isRecipientOnline = activeUsers.has(recipientId);
        
        try {
          const msg = await Message.findById(messageId);
          if (msg) {
            // Calculate time since message was created for optimization
            if (msg.createdAt) {
              messageAge = Date.now() - new Date(msg.createdAt).getTime();
            }
            
            // Mark as delivered in database
            const alreadyDelivered = msg.deliveredTo && msg.deliveredTo.some(
              (d) => d.userId.toString() === recipientId.toString()
            );
            if (!alreadyDelivered) {
              msg.deliveredTo = msg.deliveredTo || [];
              msg.deliveredTo.push({
                userId: recipientId,
                deliveredAt: new Date()
              });
              await msg.save();
            }
          }
        } catch (dbErr) {
          console.error('Error persisting delivery status:', dbErr);
        }
      }
      
      // Use delivery buffer to coalesce delivery acknowledgements
      // This prevents UI flicker from rapid Sent → Delivered transitions
      // Persistence happens immediately above, but emission is buffered
      const deliveredTimestamp = new Date().toISOString();
      const deviceId = socket.id; // Use socket ID as device identifier
      
      console.log('ACK received → buffering message:delivered:', { 
        conversationId, 
        messageId, 
        targetRoom, 
        senderId,
        recipientId,
        deviceId,
        isRecipientOnline,
        messageAge: messageAge !== null ? `${messageAge}ms` : 'unknown',
        bufferDelay: `${DELIVERED_BUFFER_MS}ms`
      });
      
      // Determine if this is urgent (bypass buffer)
      // For now, all deliveries go through buffer, but can be extended for urgent cases
      const isUrgent = false; // Can be extended to check for urgent message types
      
      // Create emit function
      const emitDelivered = () => {
        // Add sequence number to ensure correct order (Sent = 1, Delivered = 2, Read = 3)
        // Include node-id for tie-breaking in multi-instance deployments
        const nodeId = process.env.NODE_ID || require('os').hostname() || 'single-instance';
        const deliveredPayload = { 
          conversationId, 
          messageId,
          seq: 2, // Status sequence: Delivered = 2
          timestamp: deliveredTimestamp,
          nodeId: nodeId // Node ID for tie-breaking (when seq and timestamp are equal)
        };
        
        io.to(targetRoom).emit('message:delivered', deliveredPayload);
        
        // Also emit to sender's personal room if different
        if (senderId && targetRoom !== `user:${senderId}`) {
          io.to(`user:${senderId}`).emit('message:delivered', deliveredPayload);
        }
      };
      
      // Buffer the delivery
      deliveryBuffer.bufferDelivery(
        {
          conversationId,
          messageId,
          senderId,
          recipientId,
          deviceId,
          statusSeq: 2,
          timestamp: deliveredTimestamp,
        },
        emitDelivered,
        isUrgent
      );
    } catch (err) {
      console.error('Error handling message:received', err);
    }
  });

  // Video call signaling
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', data);
  });

  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', data);
  });

  // Typing indicator handler with server-side throttling/coalescing
  socket.on('typing', (payload) => {
    try {
      const { conversationId, isTyping, userName: payloadUserName } = payload || {};
      const rawUserId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
      const senderUserId = rawUserId ? rawUserId.toString() : null;
      
      if (!conversationId || !senderUserId) {
        console.warn('[Typing] Invalid typing payload:', payload);
        return;
      }
      
      const throttleKey = `${conversationId}:${senderUserId}`;
      const now = Date.now();
      const throttleWindow = 300; // 300ms throttle window (max 1 broadcast per 300ms)
      
      // Check if we should throttle this event (get throttle data first)
      const throttleData = typingThrottleMap.get(throttleKey);
      const timeSinceLastBroadcast = throttleData ? now - throttleData.lastBroadcast : Infinity;
      
      // Get user name from cache or throttle data (avoid DB query on every event)
      let userName = payloadUserName || 'User';
      const cachedUser = userNamesCache.get(senderUserId);
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
      
      // Use cached userName from throttle data if available (from previous event)
      if (throttleData && throttleData.userName) {
        userName = throttleData.userName;
      } else if (!payloadUserName && cachedUser && (now - cachedUser.cachedAt < CACHE_TTL)) {
        userName = cachedUser.name;
      } else {
        // Fetch from database asynchronously (don't block the event)
        // Use current userName as fallback for now, update cache in background
        (async () => {
          try {
            const User = require('./models/User');
            const user = await User.findById(senderUserId).select('name').lean();
            if (user && user.name) {
              userNamesCache.set(senderUserId, { name: user.name, cachedAt: Date.now() });
              // Update throttle data with userName if it exists
              const currentThrottleData = typingThrottleMap.get(throttleKey);
              if (currentThrottleData) {
                currentThrottleData.userName = user.name;
              }
            }
          } catch (err) {
            console.warn('[Typing] Failed to fetch user name:', err);
          }
        })();
      }
      
      // Clear any pending timeout
      if (throttleData?.pendingTimeout) {
        clearTimeout(throttleData.pendingTimeout);
      }
      
      // If within throttle window, schedule the broadcast for later
      if (timeSinceLastBroadcast < throttleWindow && isTyping) {
        // Schedule broadcast after throttle window
        const delay = throttleWindow - timeSinceLastBroadcast;
        const pendingTimeout = setTimeout(() => {
          // Emit typing event to conversation room (excluding sender)
          socket.to(`conversation:${conversationId}`).emit('typing', {
            conversationId,
            userId: senderUserId,
            userName,
            isTyping: true,
            timestamp: new Date().toISOString() // Include timestamp for latency tracking
          });
          
          // Update throttle data
          typingThrottleMap.set(throttleKey, {
            lastBroadcast: Date.now(),
            pendingTimeout: null,
            userName
          });
        }, delay);
        
        // Store pending timeout
        typingThrottleMap.set(throttleKey, {
          lastBroadcast: throttleData?.lastBroadcast || now,
          pendingTimeout,
          userName
        });
      } else {
        // Broadcast immediately (outside throttle window or typing:stop)
        socket.to(`conversation:${conversationId}`).emit('typing', {
          conversationId,
          userId: senderUserId,
          userName,
          isTyping: isTyping !== false,
          timestamp: new Date().toISOString() // Include timestamp for latency tracking
        });
        
        // Update throttle data
        typingThrottleMap.set(throttleKey, {
          lastBroadcast: now,
          pendingTimeout: null,
          userName
        });
      }
      
      // Cleanup throttle data when typing stops
      if (!isTyping) {
        if (throttleData?.pendingTimeout) {
          clearTimeout(throttleData.pendingTimeout);
        }
        // Keep throttle data for a short time to prevent rapid start/stop cycles
        setTimeout(() => {
          typingThrottleMap.delete(throttleKey);
        }, 1000);
      }
    } catch (err) {
      console.error('[Typing] Error handling typing event:', err);
    }
  });

  // Disconnect
  socket.on('disconnect', async (reason) => {
    console.log('User disconnected:', socket.id, 'Reason:', reason);
    
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
    
    if (userId && activeUsers.has(userId)) {
      const userData = activeUsers.get(userId);
      userData.sockets.delete(socket.id);
      
      // If no more sessions, mark as offline
      // Note: Don't mark offline immediately if reason is 'io server disconnect' (might be reconnecting)
      if (userData.sockets.size === 0 && reason !== 'io server disconnect') {
        const lastSeen = new Date();
        userData.status = 'offline';
        userData.lastSeen = lastSeen;
        console.log(`User ${userId} is now offline (all sockets disconnected)`);
        
        // Save lastSeen to database
        try {
          const User = require('./models/User');
          await User.findByIdAndUpdate(userId, { lastSeen: lastSeen });
        } catch (error) {
          console.error('Failed to update lastSeen in database:', error);
        }
        
        // Broadcast to all clients
        io.emit('user-offline', { userId, lastSeen: lastSeen.toISOString() });
        activeUsers.delete(userId);
      } else if (userData.sockets.size > 0) {
        console.log(`User ${userId} still has ${userData.sockets.size} active socket(s)`);
      }
    }
  });
});

// Periodic cleanup of inactive users (2 minute inactivity threshold)
setInterval(() => {
  const now = new Date();
  for (const [userId, data] of activeUsers.entries()) {
    const minutesSinceSeen = (now - data.lastSeen) / (1000 * 60);
    if (minutesSinceSeen >= 2 && data.status === 'online') {
      data.status = 'away';
      io.emit('user-status-update', { 
        userId, 
        status: 'away', 
        lastSeen: data.lastSeen.toISOString() 
      });
      console.log(`User ${userId} marked as away`);
    }
  }
}, 60000); // Check every minute

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };
