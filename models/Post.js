const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['Free Collaboration', 'Paid Task'],
    required: true
  },
  reward: {
    type: Number,
    required: function() {
      return this.type === 'Paid Task';
    },
    min: [1, 'Reward must be at least 1 CollabPoint']
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  attachments: [{
    filename: String,
    url: String,
    fileType: String,
    size: Number
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Open'
  },
  collaborators: [{
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
      enum: ['Helper', 'Observer'],
      default: 'Helper'
    }
  }],
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  // Collaboration controls
  maxCollaborators: {
    type: Number,
    default: 0, // 0 or undefined means unlimited
    min: [0, 'Maximum collaborators cannot be negative']
  },
  collabOpen: {
    type: Boolean,
    default: true
  },
  upvotes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: {
      type: String,
      required: true,
      maxlength: [500, 'Comment cannot exceed 500 characters']
    },
    upvotes: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    replies: [{
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      content: {
        type: String,
        required: true,
        maxlength: [300, 'Reply cannot exceed 300 characters']
      },
      replyTo: {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        userName: String,
        replyId: mongoose.Schema.Types.ObjectId // If replying to another reply
      },
      upvotes: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }],
      createdAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  views: {
    type: Number,
    default: 0
  },
  isUrgent: {
    type: Boolean,
    default: false
  },
  deadline: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better search performance
postSchema.index({ title: 'text', description: 'text', tags: 'text' });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ status: 1, type: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ isDeleted: 1, deletedAt: 1 });
postSchema.index({ author: 1, isDeleted: 1 });
postSchema.index({ collabOpen: 1 });

// Virtual for upvote count
postSchema.virtual('upvoteCount').get(function() {
  return this.upvotes.length;
});

// Virtual for approved collaborators count
postSchema.virtual('approvedCollaboratorCount').get(function() {
  return Array.isArray(this.collaborators) ? this.collaborators.length : 0;
});

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Virtual for remaining days until permanent deletion
postSchema.virtual('remainingDays').get(function() {
  if (!this.isDeleted || !this.deletedAt) return null;
  const thirtyDaysFromDeletion = new Date(this.deletedAt.getTime() + (30 * 24 * 60 * 60 * 1000));
  const now = new Date();
  const diffTime = thirtyDaysFromDeletion.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Method to add collaborator
postSchema.methods.addCollaborator = function(userId, role = 'Helper') {
  const existingCollaborator = this.collaborators.find(
    collab => collab.user.toString() === userId.toString()
  );
  
  if (!existingCollaborator) {
    this.collaborators.push({ user: userId, role });
    return true;
  }
  return false;
};

// Method to remove collaborator
postSchema.methods.removeCollaborator = function(userId) {
  this.collaborators = this.collaborators.filter(
    collab => collab.user.toString() !== userId.toString()
  );
};

// Method to upvote
postSchema.methods.upvote = function(userId) {
  const existingUpvote = this.upvotes.find(
    upvote => upvote.user.toString() === userId.toString()
  );
  
  if (!existingUpvote) {
    this.upvotes.push({ user: userId });
    return true;
  }
  return false;
};

// Method to remove upvote
postSchema.methods.removeUpvote = function(userId) {
  this.upvotes = this.upvotes.filter(
    upvote => upvote.user.toString() !== userId.toString()
  );
};

// Method to upvote comment
postSchema.methods.upvoteComment = function(commentId, userId) {
  const comment = this.comments.id(commentId);
  if (!comment) return false;
  
  const existingUpvote = comment.upvotes.find(
    upvote => upvote.user.toString() === userId.toString()
  );
  
  if (!existingUpvote) {
    comment.upvotes.push({ user: userId });
    return true;
  }
  return false;
};

// Method to remove comment upvote
postSchema.methods.removeCommentUpvote = function(commentId, userId) {
  const comment = this.comments.id(commentId);
  if (!comment) return false;
  
  comment.upvotes = comment.upvotes.filter(
    upvote => upvote.user.toString() !== userId.toString()
  );
  return true;
};

// Method to upvote reply
postSchema.methods.upvoteReply = function(commentId, replyId, userId) {
  const comment = this.comments.id(commentId);
  if (!comment) return false;
  
  const reply = comment.replies.id(replyId);
  if (!reply) return false;
  
  const existingUpvote = reply.upvotes.find(
    upvote => upvote.user.toString() === userId.toString()
  );
  
  if (!existingUpvote) {
    reply.upvotes.push({ user: userId });
    return true;
  }
  return false;
};

// Method to remove reply upvote
postSchema.methods.removeReplyUpvote = function(commentId, replyId, userId) {
  const comment = this.comments.id(commentId);
  if (!comment) return false;
  
  const reply = comment.replies.id(replyId);
  if (!reply) return false;
  
  reply.upvotes = reply.upvotes.filter(
    upvote => upvote.user.toString() !== userId.toString()
  );
  return true;
};

// Method to soft delete post
postSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Method to restore post
postSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  return this.save();
};

// Static method to find non-deleted posts
postSchema.statics.findActive = function(query = {}) {
  return this.find({ ...query, isDeleted: false });
};

// Static method to find deleted posts
postSchema.statics.findDeleted = function(query = {}) {
  return this.find({ ...query, isDeleted: true });
};

module.exports = mongoose.model('Post', postSchema);
