const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    default: null // null means root folder
  },
  isFolder: {
    type: Boolean,
    default: false
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  description: {
    type: String,
    maxlength: [500, 'File description cannot exceed 500 characters']
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

fileSchema.index({ roomId: 1, folderId: 1, createdAt: -1 });
fileSchema.index({ uploadedBy: 1 });
fileSchema.index({ isFolder: 1 });

module.exports = mongoose.model('File', fileSchema);

