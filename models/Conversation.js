const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  mutedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Map of userId -> Date when mute expires (null means muted until manually unmuted)
  mutedUntil: {
    type: Map,
    of: Date,
    default: {}
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  unreadCounts: { // map of userId -> count
    type: Map,
    of: Number,
    default: {}
  },
  // Room-specific fields (for room conversations)
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  roomName: {
    type: String,
    default: null
  },
  roomStatus: {
    type: String,
    enum: ['Active', 'Completed', 'Cancelled'],
    default: null
  }
}, {
  timestamps: true
});

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);


