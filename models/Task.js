const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
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
    maxlength: [200, 'Task title cannot exceed 200 characters'],
    trim: true
  },
  description: {
    type: String,
    maxlength: [1000, 'Task description cannot exceed 1000 characters']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  dueDate: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  linkedNoteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    default: null
  },
  linkedFileIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }]
}, {
  timestamps: true
});

taskSchema.index({ roomId: 1, createdAt: -1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Task', taskSchema);

