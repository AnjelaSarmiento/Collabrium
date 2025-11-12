const Conversation = require('../models/Conversation');
const Room = require('../models/Room');

/**
 * Ensure a Conversation exists for a Room
 * Creates or updates the conversation with room participants and metadata
 * @param {string|ObjectId} roomId - The room ID
 * @returns {Promise<Conversation>} The conversation object
 */
async function ensureRoomConversation(roomId) {
  try {
    const Room = require('../models/Room');
    const room = await Room.findById(roomId)
      .populate('participants.user', '_id');
    
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Extract participant user IDs
    const participantIds = room.participants
      .map(p => p.user?._id || p.user)
      .filter(Boolean)
      .map(id => id.toString());

    // Check if conversation already exists for this room
    let conversation = await Conversation.findOne({ roomId: room._id });

    if (!conversation) {
      // Create new conversation with room participants
      conversation = await Conversation.create({
        roomId: room._id,
        roomName: room.name,
        roomStatus: room.status,
        participants: participantIds
      });
      console.log(`[RoomConversation] Created conversation ${conversation._id} for room ${roomId}`);
    } else {
      // Update existing conversation
      const needsUpdate = 
        conversation.roomName !== room.name ||
        conversation.roomStatus !== room.status ||
        JSON.stringify(conversation.participants.sort()) !== JSON.stringify(participantIds.sort());

      if (needsUpdate) {
        // Update participants (add new ones, but don't remove old ones to preserve history)
        const existingParticipantIds = conversation.participants.map(p => p.toString());
        const newParticipants = participantIds.filter(id => !existingParticipantIds.includes(id));
        
        if (newParticipants.length > 0) {
          conversation.participants = [...conversation.participants, ...newParticipants];
        }

        conversation.roomName = room.name;
        conversation.roomStatus = room.status;
        await conversation.save();
        console.log(`[RoomConversation] Updated conversation ${conversation._id} for room ${roomId}`);
      }
    }

    return conversation;
  } catch (error) {
    console.error(`[RoomConversation] Error ensuring conversation for room ${roomId}:`, error);
    throw error;
  }
}

/**
 * Sync room participants to conversation participants
 * Called when room participants change (e.g., when someone is added/removed)
 * @param {string|ObjectId} roomId - The room ID
 */
async function syncRoomParticipantsToConversation(roomId) {
  try {
    const Room = require('../models/Room');
    const room = await Room.findById(roomId)
      .populate('participants.user', '_id');
    
    if (!room) {
      console.warn(`[RoomConversation] Room ${roomId} not found for participant sync`);
      return;
    }

    const conversation = await Conversation.findOne({ roomId: room._id });
    if (!conversation) {
      // If conversation doesn't exist, create it
      await ensureRoomConversation(roomId);
      return;
    }

    // Extract current participant IDs
    const currentParticipantIds = room.participants
      .map(p => p.user?._id || p.user)
      .filter(Boolean)
      .map(id => id.toString());

    // Get existing participant IDs from conversation
    const existingParticipantIds = conversation.participants.map(p => p.toString());

    // Add new participants (don't remove old ones to preserve access to chat history)
    const newParticipants = currentParticipantIds.filter(id => !existingParticipantIds.includes(id));
    
    if (newParticipants.length > 0) {
      conversation.participants = [...conversation.participants, ...newParticipants];
      await conversation.save();
      console.log(`[RoomConversation] Added ${newParticipants.length} new participants to conversation ${conversation._id}`);
    }

    // Update room metadata
    if (conversation.roomName !== room.name || conversation.roomStatus !== room.status) {
      conversation.roomName = room.name;
      conversation.roomStatus = room.status;
      await conversation.save();
    }
  } catch (error) {
    console.error(`[RoomConversation] Error syncing participants for room ${roomId}:`, error);
  }
}

module.exports = {
  ensureRoomConversation,
  syncRoomParticipantsToConversation
};

