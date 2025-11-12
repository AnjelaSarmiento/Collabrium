const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Create or get DM conversation between current user and target
router.post('/dm/:userId', authenticateToken, async (req, res) => {
  try {
    const me = req.user._id.toString();
    const other = req.params.userId;
    if (me === other) return res.status(400).json({ success: false, message: 'Cannot DM yourself' });

    let convo = await Conversation.findOne({ participants: { $all: [me, other], $size: 2 } })
      .populate('participants', 'name profilePicture');
    if (!convo) {
      convo = await Conversation.create({ participants: [me, other] });
      await convo.populate('participants', 'name profilePicture');
    }
    res.json({ success: true, conversation: convo });
  } catch (e) {
    console.error('create dm error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// List conversations for current user
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const Room = require('../models/Room');
    
    const convos = await Conversation.find({ participants: req.user._id })
      .sort({ lastMessageAt: -1 })
      .populate('participants', 'name profilePicture')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'name profilePicture' } });
    
    // Map to include unread count for current user and check mute status (with expiration)
    const conversationsWithUnread = await Promise.all(convos.map(async (convo) => {
      const convoObj = convo.toObject();
      convoObj.unreadCount = convo.unreadCounts?.get(userId) || 0;
      
      // For room conversations, get room metadata
      if (convo.roomId) {
        try {
          const room = await Room.findById(convo.roomId).select('name status participants').lean();
          if (room) {
            convoObj.roomName = room.name || convo.roomName;
            convoObj.roomStatus = room.status || convo.roomStatus;
            convoObj.isRoom = true;
            
            // Check if user is still a participant in the room
            const isRoomParticipant = room.participants?.some(
              p => (p.user?._id || p.user || p).toString() === userId
            );
            convoObj.isRoomParticipant = isRoomParticipant;
          }
        } catch (roomError) {
          console.error('[Messages] Error fetching room for conversation:', roomError);
          convoObj.isRoom = true;
          convoObj.isRoomParticipant = false; // Assume not participant if room fetch fails
        }
      } else {
        // Regular DM conversation - get the other participant (not the current user)
        convoObj.otherParticipant = convo.participants.find(p => p._id.toString() !== userId);
      }
      
      // Check if conversation is muted for current user (consider expiration)
      const mutedBy = Array.isArray(convo.mutedBy) ? convo.mutedBy.map(id => id.toString()) : [];
      const isInMutedBy = mutedBy.includes(userId);
      let isMuted = false;
      
      if (isInMutedBy) {
        // Check if mute has expired
        if (convo.mutedUntil && convo.mutedUntil instanceof Map) {
          const mutedUntil = convo.mutedUntil.get(userId);
          if (mutedUntil === null || mutedUntil === undefined) {
            // null means muted until manually unmuted (permanent mute)
            isMuted = true;
          } else if (mutedUntil instanceof Date) {
            // Check if expiration date is in the future
            isMuted = mutedUntil > new Date();
            if (!isMuted) {
              // Mute has expired, clean it up (async, don't await to avoid blocking response)
              convo.mutedBy = convo.mutedBy.filter(id => id.toString() !== userId);
              convo.mutedUntil.delete(userId);
              convo.save().catch(err => {
                console.error('[Messages] Failed to clean up expired mute:', err);
              });
            }
          }
        } else {
          // No mutedUntil map, fall back to mutedBy check (legacy behavior)
          isMuted = isInMutedBy;
        }
      }
      
      convoObj.isMuted = isMuted;
      // Include mutedUntil date if muted (for frontend expiration checking)
      if (isMuted && convo.mutedUntil && convo.mutedUntil instanceof Map) {
        const mutedUntil = convo.mutedUntil.get(userId);
        if (mutedUntil instanceof Date) {
          convoObj.mutedUntil = mutedUntil.toISOString();
        } else if (mutedUntil === null) {
          convoObj.mutedUntil = null; // Permanent mute
        }
      }
      return convoObj;
    }));
    
    res.json({ success: true, conversations: conversationsWithUnread });
  } catch (e) {
    console.error('list conversations error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Check mute expiration for all conversations (called periodically by frontend)
router.get('/conversations/mute-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const convos = await Conversation.find({ participants: req.user._id });
    
    const muteStatuses = [];
    const now = new Date();
    let hasChanges = false;
    
    for (const convo of convos) {
      const mutedBy = Array.isArray(convo.mutedBy) ? convo.mutedBy.map(id => id.toString()) : [];
      const isInMutedBy = mutedBy.includes(userId);
      let isMuted = false;
      let mutedUntil = null;
      
      if (isInMutedBy) {
        // Check if mute has expired
        if (convo.mutedUntil && convo.mutedUntil instanceof Map) {
          mutedUntil = convo.mutedUntil.get(userId) || null;
          if (mutedUntil === null) {
            // null means muted until manually unmuted (permanent mute)
            isMuted = true;
          } else if (mutedUntil instanceof Date) {
            // Check if expiration date is in the future
            isMuted = mutedUntil > now;
            if (!isMuted) {
              // Mute has expired, clean it up
              hasChanges = true;
              convo.mutedBy = convo.mutedBy.filter(id => id.toString() !== userId);
              convo.mutedUntil.delete(userId);
              await convo.save();
              console.log(`[Messages] ⏰ Mute expired and cleaned up for conversation ${convo._id}, user ${userId}`);
            }
          }
        } else {
          // No mutedUntil map, fall back to mutedBy check (legacy behavior)
          isMuted = isInMutedBy;
        }
      }
      
      muteStatuses.push({
        conversationId: convo._id.toString(),
        isMuted,
        mutedUntil: mutedUntil ? mutedUntil.toISOString() : (isMuted ? null : undefined)
      });
    }
    
    res.json({ 
      success: true, 
      muteStatuses,
      hasChanges // Indicates if any mutes were cleaned up
    });
  } catch (e) {
    console.error('check mute status error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get messages for conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();
    const Room = require('../models/Room');
    
    // Check if user has access to this conversation
    const convo = await Conversation.findById(id);
    if (!convo) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    
    // Check if user is a participant
    const isParticipant = convo.participants.some(p => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // For room conversations, verify user is still a room participant
    if (convo.roomId) {
      const room = await Room.findById(convo.roomId).lean();
      if (room) {
        const isRoomParticipant = room.participants?.some(
          p => (p.user?._id || p.user || p).toString() === userId
        );
        if (!isRoomParticipant) {
          return res.status(403).json({ success: false, message: 'You are no longer a participant in this room' });
        }
      }
    }
    
    const messages = await Message.find({ conversation: id })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profilePicture')
      .lean(); // Use lean() to get plain JavaScript objects
    
    // Ensure deliveredTo userId references are properly serialized
    const serializedMessages = messages.map(msg => ({
      ...msg,
      deliveredTo: msg.deliveredTo ? msg.deliveredTo.map(d => ({
        userId: d.userId ? d.userId.toString() : d.userId,
        deliveredAt: d.deliveredAt
      })) : [],
      seenBy: msg.seenBy ? msg.seenBy.map(id => id.toString()) : []
    }));
    
    res.json({ success: true, messages: serializedMessages });
  } catch (e) {
    console.error('Get messages error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send message
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, attachments = [] } = req.body;
    const userId = req.user._id.toString();
    const Room = require('../models/Room');
    
    const convo = await Conversation.findById(id);
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });
    
    // Check if user is a participant
    const isParticipant = convo.participants.some(p => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // For room conversations, verify user is still a room participant
    if (convo.roomId) {
      const room = await Room.findById(convo.roomId).lean();
      if (room) {
        const isRoomParticipant = room.participants?.some(
          p => (p.user?._id || p.user || p).toString() === userId
        );
        if (!isRoomParticipant) {
          return res.status(403).json({ success: false, message: 'You are no longer a participant in this room' });
        }
      }
    }
    
    const msg = await Message.create({ 
      conversation: id, 
      sender: req.user._id, 
      content, 
      attachments 
    });
    
    await msg.populate('sender', 'name profilePicture');

    // Update conversation with last message and increment unread for other participants
    const otherParticipants = convo.participants.filter(p => p.toString() !== userId);
    // Normalize to string IDs for downstream logic
    const recipientIds = otherParticipants.map(p => p.toString());

    const updateData = {
      lastMessage: msg._id,
      lastMessageAt: msg.createdAt
    };
    
    // For room conversations, increment unread for all other participants
    // For DM conversations, increment unread for the other participant
    if (otherParticipants.length > 0) {
      const unreadUpdates = {};
      otherParticipants.forEach(participant => {
        unreadUpdates[`unreadCounts.${participant}`] = 1;
      });
      updateData.$inc = unreadUpdates;
    }
    
    await Conversation.findByIdAndUpdate(id, updateData);

    const io = req.app.get('io');
    if (io) {
      // For room conversations, we'll check mute status per recipient when emitting
      // For now, we'll emit to all participants and let the client handle mute status
      
      const payload = { 
        conversationId: id, 
        message: msg
      };
      
      // CRITICAL: Emit message:sent to sender's personal room FIRST and SYNCHRONOUSLY
      // This MUST happen before message:new to ensure the sender receives sent confirmation
      // before any delivery events can arrive. This is separate from message:delivered
      // which is emitted later when recipient ACKs.
      // Add sequence number to ensure correct order (Sent = 1, Delivered = 2, Read = 3)
      // Include node-id for tie-breaking in multi-instance deployments
      const nodeId = process.env.NODE_ID || require('os').hostname() || 'single-instance';
      const sentPayload = {
        conversationId: id,
        messageId: msg._id.toString(),
        seq: 1, // Status sequence: Sent = 1
        timestamp: new Date().toISOString(),
        nodeId: nodeId // Node ID for tie-breaking (when seq and timestamp are equal)
      };
      const sentTimestamp = new Date().toISOString();
      io.to(`user:${req.user._id}`).emit('message:sent', sentPayload);
      console.log('[Messages] ✅ Emitted message:sent to sender (BEFORE message:new) at', sentTimestamp, ':', {
        conversationId: id,
        messageId: msg._id.toString(),
        senderId: req.user._id.toString(),
        timestamp: sentTimestamp
      });
      
      // Emit to conversation room (viewers of the thread)
      io.to(`conversation:${id}`).emit('message:new', payload);
      
      // Emit directly to each recipient's personal room (DM or room participants)
      recipientIds.forEach(recipientId => {
        io.to(`user:${recipientId}`).emit('message:new', payload);
      });
      
      // Note: message:delivered is now only emitted via the 'message:received' ACK handler in server.js
      io.emit('conversation:update', { conversationId: id });
    }

    // Persist a notification for the recipient and emit a notification event
    try {
      for (const recipientId of recipientIds) {
        const { sendNotification } = require('../utils/notifications');
        const io = req.app.get('io');
        
        // Check if the recipient is currently viewing this conversation
        // If they have any sockets in the conversation room, they're viewing it
        let isRecipientViewingConversation = false;
        if (io) {
          try {
            const conversationRoom = `conversation:${id}`;
            const recipientUserRoom = `user:${recipientId}`;

            // Check if recipient is viewing conversation using multiple methods for reliability
            // Method 1: Use fetchSockets to get all sockets in recipient's user room
            // Then check if any of those sockets are also in the conversation room
            try {
              const recipientSockets = await io.in(recipientUserRoom).fetchSockets();
              
              if (recipientSockets && recipientSockets.length > 0) {
                // Check each socket's rooms to see if it's in the conversation room
                for (const socket of recipientSockets) {
                  // socket.rooms is a Set of room IDs that this socket is in
                  const rooms = socket.rooms;
                  if (rooms && rooms.has && rooms.has(conversationRoom)) {
                    isRecipientViewingConversation = true;
                    console.log(`[Messages] Found recipient socket ${socket.id} in conversation room ${conversationRoom}`);
                    break;
                  }
                  // Fallback: convert to array if Set methods not available
                  if (rooms && Array.isArray(Array.from(rooms)) && Array.from(rooms).includes(conversationRoom)) {
                    isRecipientViewingConversation = true;
                    console.log(`[Messages] Found recipient socket ${socket.id} in conversation room ${conversationRoom} (array check)`);
                    break;
                  }
                }
              } else {
                console.log('[Messages] No sockets found in recipient user room:', recipientUserRoom);
              }
            } catch (fetchError) {
              console.error('[Messages] Failed to fetch sockets for room check:', fetchError);
              // Fallback: Try adapter method if fetchSockets fails
              try {
                const adapter = io.of('/').adapter;
                if (adapter && adapter.rooms) {
                  const conversationRoomSet = adapter.rooms.get(conversationRoom);
                  const recipientRoomSet = adapter.rooms.get(recipientUserRoom);

                  if (conversationRoomSet && recipientRoomSet) {
                    // Check if any socket in recipient room is also in conversation room
                    for (const socketId of recipientRoomSet) {
                      if (conversationRoomSet.has(socketId)) {
                        isRecipientViewingConversation = true;
                        console.log(`[Messages] Found recipient socket ${socketId} in conversation room (adapter method)`);
                        break;
                      }
                    }
                  }
                }
              } catch (adapterError) {
                console.error('[Messages] Both methods failed:', adapterError);
                isRecipientViewingConversation = false;
              }
            }

            // Get room sizes for logging (handle undefined cases)
            let conversationRoomSize = 0;
            let recipientRoomSize = 0;
            try {
              const adapter = io.of('/').adapter;
              const cs = adapter.rooms?.get(conversationRoom);
              const rs = adapter.rooms?.get(recipientUserRoom);
              conversationRoomSize = cs ? cs.size : 0;
              recipientRoomSize = rs ? rs.size : 0;
            } catch (e) {
              // Ignore logging errors
            }

            console.log('[Messages] Notification check:', {
              conversationId: id,
              recipientId,
              isRecipientViewingConversation,
              conversationRoomSize,
              recipientRoomSize,
              conversationRoom,
              recipientUserRoom,
              willMarkAsRead: isRecipientViewingConversation
            });
          } catch (roomCheckError) {
            console.error('[Messages] Error checking if recipient is viewing conversation:', roomCheckError);
            // If check fails, assume they're not viewing (safer to show notification)
            isRecipientViewingConversation = false;
          }
        }
        
        await sendNotification(req, {
          type: 'message',
          recipientId: recipientId,
          actor: {
            _id: req.user._id,
            name: req.user.name,
            profilePicture: req.user.profilePicture
          },
          metadata: {
            conversationId: id.toString(),
            messageId: msg._id.toString(),
            preview: content
          },
          // Mark as read if recipient is viewing the conversation
          saveToDb: true,
          read: isRecipientViewingConversation // This should be true if user is in conversation room
        });
        
        console.log('[Messages] Notification sent:', {
          recipientId,
          conversationId: id.toString(),
          markedAsRead: isRecipientViewingConversation,
          reason: isRecipientViewingConversation ? 'Recipient is viewing conversation' : 'Recipient not viewing conversation'
        });
      }
    } catch (notifyErr) {
      console.error('[Messages] Failed to emit/persist message notification:', notifyErr);
      // Do not fail sending message if notification fails
    }

    res.json({ success: true, message: msg });
  } catch (e) {
    console.error('send message error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Mute/unmute conversation for current user
router.post('/conversations/:id/mute', authenticateToken, async (req, res) => {
  console.log('[Messages] Mute route hit:', req.params.id, req.body);
  try {
    const { id } = req.params;
    const { mute, durationMinutes } = req.body || {};
    const userId = req.user._id.toString();

    const convo = await Conversation.findById(id);
    if (!convo) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = convo.participants.some(p => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
    }

    // Initialize mutedUntil Map if it doesn't exist
    if (!convo.mutedUntil) {
      convo.mutedUntil = new Map();
    }

    const mutedBy = Array.isArray(convo.mutedBy) ? convo.mutedBy.map(id => id.toString()) : [];
    const currentlyMuted = mutedBy.includes(userId);
    
    // If mute is explicitly false, unmute
    // If mute is true or undefined (and not currently muted), mute with duration
    const shouldMute = mute === false ? false : (mute === true || !currentlyMuted);

    if (!Array.isArray(convo.mutedBy)) {
      convo.mutedBy = [];
    }

    if (shouldMute) {
      // Calculate expiration date
      let mutedUntil = null;
      if (durationMinutes !== null && durationMinutes !== undefined) {
        mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
      }
      // mutedUntil = null means "until manually unmuted"
      
      // Add to mutedBy array if not already there
      if (!currentlyMuted) {
        convo.mutedBy.push(req.user._id);
      }
      
      // Always update mutedUntil date (even if already muted, to change duration)
      convo.mutedUntil.set(userId, mutedUntil);
      console.log(`[Messages] Muted conversation for user ${userId} until:`, mutedUntil || 'manually unmuted');
    } else {
      // Unmute: remove from mutedBy and clear mutedUntil
      convo.mutedBy = convo.mutedBy.filter(id => id.toString() !== userId);
      convo.mutedUntil.delete(userId);
      console.log(`[Messages] Unmuted conversation for user ${userId}`);
    }

    await convo.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('conversation:update', { conversationId: id });
    }

    res.json({
      success: true,
      isMuted: shouldMute,
      mutedUntil: shouldMute ? (() => {
        const mutedUntil = convo.mutedUntil.get(userId);
        return mutedUntil instanceof Date ? mutedUntil.toISOString() : mutedUntil;
      })() : null
    });
  } catch (e) {
    console.error('mute conversation error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Mark messages as read
router.post('/conversations/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();
    
    // Mark all messages in conversation as seen by this user
    await Message.updateMany(
      { conversation: id, sender: { $ne: req.user._id } },
      { $addToSet: { seenBy: req.user._id } }
    );
    
    // Reset unread count
    await Conversation.findByIdAndUpdate(id, {
      $set: { [`unreadCounts.${userId}`]: 0 }
    });

    // IMPORTANT: Mark all message notifications for this conversation as read
    // This ensures notifications are marked as read when user views the conversation
    try {
      const Notification = require('../models/Notification');
      const updateResult = await Notification.updateMany(
        {
          recipient: req.user._id,
          type: 'message',
          'metadata.conversationId': id.toString(),
          read: false // Only update unread notifications
        },
        {
          read: true,
          readAt: new Date()
        }
      );
      
      console.log('[Messages] Marked notifications as read:', {
        conversationId: id,
        userId: userId,
        updatedCount: updateResult.modifiedCount
      });
      
      // Emit refresh event to update notification count if any were marked as read
      if (updateResult.modifiedCount > 0) {
        const io = req.app.get('io');
        if (io) {
          io.to(`user:${userId}`).emit('notifications:refresh-count');
          console.log('[Messages] Emitted notifications:refresh-count after marking message notifications as read');
        }
      }
    } catch (notifError) {
      console.error('[Messages] Error marking message notifications as read:', notifError);
      // Don't fail the request if notification update fails
    }

    const io = req.app.get('io');
    if (io) {
      // Get conversation to find the other participant (sender of messages that were read)
      const convo = await Conversation.findById(id);
      if (convo) {
        // Find the other participant (the sender of messages that were just read)
        const otherParticipant = convo.participants.find(p => p.toString() !== userId);
        
        // Emit to conversation room (all viewers of the thread)
        // Include node-id for tie-breaking in multi-instance deployments
        const nodeId = process.env.NODE_ID || require('os').hostname() || 'single-instance';
        const seenPayload = { 
          conversationId: id, 
          userId,
          seq: 3, // Status sequence: Read = 3
          timestamp: new Date().toISOString(),
          nodeId: nodeId // Node ID for tie-breaking (when seq and timestamp are equal)
        };
        io.to(`conversation:${id}`).emit('message:seen', seenPayload);
        
        // Also emit to the other participant's personal room (sender of the messages that were read)
        // This ensures the sender receives the read notification even if they're not in the conversation room
        if (otherParticipant) {
          io.to(`user:${otherParticipant}`).emit('message:seen', seenPayload);
          console.log('[Messages] Emitted message:seen to sender:', {
            conversationId: id,
            readerUserId: userId,
            senderUserId: otherParticipant.toString(),
            seq: 3,
            timestamp: seenPayload.timestamp,
            nodeId: nodeId
          });
        }
      } else {
        // Fallback: just emit to conversation room if conversation not found
        const nodeId = process.env.NODE_ID || require('os').hostname() || 'single-instance';
        const seenPayload = { 
          conversationId: id, 
          userId,
          seq: 3, // Status sequence: Read = 3
          timestamp: new Date().toISOString(),
          nodeId: nodeId // Node ID for tie-breaking (when seq and timestamp are equal)
        };
        io.to(`conversation:${id}`).emit('message:seen', seenPayload);
      }
      
      io.emit('conversation:update', { conversationId: id });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('mark read error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete conversation
router.delete('/conversations/:id', authenticateToken, async (req, res) => {
  console.log('[Messages] Delete route hit:', req.params.id);
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    const convo = await Conversation.findById(id);
    if (!convo) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const isParticipant = convo.participants.some(p => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
    }

    // Delete all messages in the conversation
    await Message.deleteMany({ conversation: id });

    // Delete the conversation
    await Conversation.findByIdAndDelete(id);

    const io = req.app.get('io');
    if (io) {
      // Notify all participants that the conversation was deleted
      convo.participants.forEach(participantId => {
        io.to(`user:${participantId}`).emit('conversation:deleted', { conversationId: id });
      });
      io.emit('conversation:update', { conversationId: id });
    }

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (e) {
    console.error('delete conversation error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Typing indicator (emits socket event)
router.post('/conversations/:id/typing', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isTyping } = req.body;
    
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${id}`).emit('typing', { 
        conversationId: id, 
        userId: req.user._id.toString(),
        userName: req.user.name,
        isTyping: isTyping !== false 
      });
    }
    
    res.json({ success: true });
  } catch (e) {
    console.error('typing indicator error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;



