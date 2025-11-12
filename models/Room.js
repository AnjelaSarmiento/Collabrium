const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [100, 'Room name cannot exceed 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['Creator', 'Helper', 'Observer'],
      default: 'Helper'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Cancelled'],
    default: 'Active'
  },
  chatMessages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    messageType: {
      type: String,
      enum: ['text', 'file', 'image', 'code', 'system'],
      default: 'text'
    },
    attachments: [{
      filename: String,
      url: String,
      fileType: String,
      size: Number
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    editedAt: {
      type: Date
    },
    isEdited: {
      type: Boolean,
      default: false
    }
  }],
  sharedFiles: [{
    filename: String,
    url: String,
    fileType: String,
    size: Number,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  whiteboardData: {
    type: String, // JSON string of whiteboard state
    default: '{}'
  },
  tasks: [{
    title: {
      type: String,
      required: true,
      maxlength: [200, 'Task title cannot exceed 200 characters']
    },
    description: String,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending'
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date
  }],
  sessionStart: {
    type: Date,
    default: Date.now
  },
  sessionEnd: Date,
  totalDuration: {
    type: Number, // in minutes
    default: 0
  },
  isVideoCallActive: {
    type: Boolean,
    default: false
  },
  videoCallParticipants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date
  }],
  rewardDistributed: {
    type: Boolean,
    default: false
  },
  rewardDistribution: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    amount: Number,
    distributedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for better performance
roomSchema.index({ postId: 1 });
roomSchema.index({ creator: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ 'participants.user': 1 });

// Method to add participant
roomSchema.methods.addParticipant = function(userId, role = 'Helper') {
  const existingParticipant = this.participants.find(
    participant => participant.user.toString() === userId.toString()
  );
  
  if (!existingParticipant) {
    this.participants.push({ user: userId, role });
    return true;
  }
  return false;
};

// Method to remove participant
roomSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(
    participant => participant.user.toString() !== userId.toString()
  );
};

// Method to add chat message
roomSchema.methods.addMessage = function(senderId, content, messageType = 'text', attachments = []) {
  this.chatMessages.push({
    sender: senderId,
    content,
    messageType,
    attachments
  });
};

// Method to add shared file
roomSchema.methods.addSharedFile = function(filename, url, fileType, size, uploadedBy) {
  this.sharedFiles.push({
    filename,
    url,
    fileType,
    size,
    uploadedBy
  });
};

// Method to add task
roomSchema.methods.addTask = function(title, description, assignedTo, priority = 'Medium') {
  this.tasks.push({
    title,
    description,
    assignedTo,
    priority
  });
};

// Method to complete room and calculate duration
roomSchema.methods.completeRoom = function() {
  this.status = 'Completed';
  this.sessionEnd = new Date();
  this.totalDuration = Math.round((this.sessionEnd - this.sessionStart) / (1000 * 60)); // in minutes
};

module.exports = mongoose.model('Room', roomSchema);
