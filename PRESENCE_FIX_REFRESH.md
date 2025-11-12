# Fix: User Goes Offline on Page Refresh

## Problem
When a user refreshes the page, they would show as "offline" even though they're still active. This happened because:
1. Page refresh = disconnect + reconnect
2. Old socket removed from `activeUsers` map
3. New socket wasn't properly re-added

## Solution

### Changes Made

#### 1. **Server.js** - Smart Reconnection Handling
```javascript
const isNewConnection = !activeUsers.has(userId);

if (isNewConnection) {
  // First time connecting - mark as online
  activeUsers.set(userId, {
    sockets: new Set([socket.id]),
    status: 'online',
    lastSeen: new Date()
  });
  io.emit('user-online', { userId, lastSeen: new Date().toISOString() });
} else {
  // User reconnecting (page refresh) - keep existing status
  const userData = activeUsers.get(userId);
  userData.sockets.add(socket.id);  // ✅ Add new socket
  userData.lastSeen = new Date();
  
  // If user was away, bring them back online
  if (userData.status === 'away') {
    userData.status = 'online';
    socket.broadcast.emit('user-online', { userId, lastSeen: new Date().toISOString() });
  }
}
```

#### 2. **SocketContext.tsx** - Removed Manual `update-presence`
- Removed the manual `update-presence` emit on connect
- Server now handles this automatically

## How It Works Now

### **Method 1: Socket.IO Real-Time Tracking (Currently Implemented)**

**Backend** (`server.js`):
- Maintains `activeUsers` Map to track all sessions
- Each socket reconnection adds to the existing Set
- User only goes offline when ALL sockets disconnect
- Heartbeat every 30 seconds keeps them active

**Frontend** (`client/src/contexts/SocketContext.tsx`):
- Establishes WebSocket connection with `userId` in auth
- Sends heartbeat every 30 seconds
- Automatically reconnects on page refresh

**Flow:**
1. User connects → Added to `activeUsers` Map
2. Page refresh → Socket ID changes, but `userId` stays same
3. New socket → Added to existing Set in `activeUsers`
4. Old socket → Removed on disconnect
5. User stays online as long as they have at least one active socket

### **Method 2: Periodic HTTP Pings (Alternative Approach)**

If you prefer HTTP over WebSocket:

**Backend** (`routes/users.js`):
```javascript
router.post('/ping', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Update lastActive timestamp
    await User.findByIdAndUpdate(userId, { 
      lastActive: new Date(),
      isOnline: true 
    });
    
    res.json({ success: true, message: 'Ping received' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Periodic cleanup (runs every 2 minutes)
setInterval(async () => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  await User.updateMany(
    { lastActive: { $lt: twoMinutesAgo } },
    { isOnline: false }
  );
}, 120000);
```

**Frontend** (`useEffect` in a custom hook):
```javascript
useEffect(() => {
  const pingInterval = setInterval(async () => {
    try {
      await axios.post('/api/users/ping');
    } catch (error) {
      console.error('Failed to ping server:', error);
    }
  }, 30000); // Every 30 seconds

  return () => clearInterval(pingInterval);
}, []);
```

**Pros:**
- ✅ Simple HTTP requests
- ✅ No WebSocket complexity
- ✅ Works with any HTTP client

**Cons:**
- ❌ Not truly real-time (30 second delay)
- ❌ Server load from many HTTP requests
- ❌ Less efficient than WebSocket

## Current Implementation Status

✅ **Socket.IO is implemented and working**
- Page refresh handled correctly
- Multi-tab/device support
- Real-time status updates
- Inactivity detection (2 minutes)

## Testing

1. **Open two browser windows**
2. **Login as User A in window 1, User B in window 2**
3. **User B views User A's profile** → Shows "🟢 Online"
4. **Refresh User A's page** → User A remains "🟢 Online" for User B
5. **Close User A's browser** → User A shows "⚪ Last Online just now"

## Key Points

1. **Socket ID ≠ User ID**: Socket ID changes on reconnect, but we track by `userId`
2. **Multiple Sessions**: One user can have multiple sockets (multiple tabs)
3. **Last Session Wins**: User goes offline only when ALL sockets disconnect
4. **Heartbeat**: Prevents false "away" status during active use

