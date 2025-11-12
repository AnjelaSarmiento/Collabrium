const mongoose = require('mongoose');

/**
 * CollaborationRequest Model
 * Tracks collaboration requests for posts
 * Status flow: pending -> approved/declined
 */
const collaborationRequestSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  postOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined'],
    default: 'pending',
    index: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
collaborationRequestSchema.index({ post: 1, requester: 1, status: 1 });
collaborationRequestSchema.index({ postOwner: 1, status: 1 });
collaborationRequestSchema.index({ requester: 1, status: 1 });

// Prevent duplicate pending requests
collaborationRequestSchema.index({ post: 1, requester: 1 }, { 
  unique: true,
  partialFilterExpression: { status: 'pending' }
});

module.exports = mongoose.model('CollaborationRequest', collaborationRequestSchema);

