const mongoose = require('mongoose');

/**
 * Notification Model - Flexible design for different notification types
 * Supports: messages, connection_requests, connection_accepted, comment_added, reaction_added
 */
const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'message',
      'connection_request',
      'connection_accepted',
      'comment_added',
      'reaction_added',
      'post_reaction_added',
      'reply_added',
      'post_created',
      'collaboration_request',
      'collaboration_request_approved',
      'collaboration_request_declined'
    ],
    index: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Reference to related entity (optional, depends on type)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Post', 'Message', 'Comment', null]
  },
  // Metadata for flexible data storage
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Status tracking
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

