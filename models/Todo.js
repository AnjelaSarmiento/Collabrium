const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
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
    maxlength: [200, 'Todo title cannot exceed 200 characters'],
    trim: true
  },
  description: {
    type: String,
    maxlength: [500, 'Todo description cannot exceed 500 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

todoSchema.index({ roomId: 1, completed: 1, order: 1 });
todoSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Todo', todoSchema);

