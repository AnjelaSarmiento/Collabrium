const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: [200, 'Note title cannot exceed 200 characters'],
    trim: true,
    default: 'Untitled Note'
  },
  content: {
    type: String,
    default: '',
    // Rich text content (HTML or markdown)
    maxlength: [50000, 'Note content cannot exceed 50000 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastEditedAt: {
    type: Date,
    default: Date.now
  },
  tags: [{
    type: String,
    trim: true
  }],
  linkedTaskIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  linkedFileIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }],
  isPinned: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

noteSchema.index({ roomId: 1, createdAt: -1 });
noteSchema.index({ createdBy: 1 });
noteSchema.index({ isPinned: -1, updatedAt: -1 });

module.exports = mongoose.model('Note', noteSchema);

