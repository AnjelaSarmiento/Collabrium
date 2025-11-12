const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password is required only if not using Google OAuth
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values, but unique non-null values
  },
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  skills: [{
    type: String,
    trim: true
  }],
  profilePicture: {
    type: String,
    default: ''
  },
  collabPoints: {
    type: Number,
    default: 100 // Starting points
  },
  level: {
    type: Number,
    default: 1
  },
  experience: {
    type: Number,
    default: 0
  },
  badges: [{
    name: String,
    description: String,
    icon: String,
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  availability: {
    type: String,
    enum: ['Online', 'Busy', 'Accepting Paid Tasks', 'Offline'],
    default: 'Online'
  },
  completedCollaborations: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [{
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  savedPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  // Social graph
  connections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  connectionRequests: [{ // incoming requests (who asked to connect with me)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  sentRequests: [{ // outgoing requests I sent to others
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  reports: [{
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      required: true,
      maxlength: 200
    },
    details: {
      type: String,
      maxlength: 1000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false; // Google OAuth users don't have passwords
  return await bcrypt.compare(candidatePassword, this.password);
};

// Calculate level based on experience
userSchema.methods.calculateLevel = function() {
  this.level = Math.floor(this.experience / 100) + 1;
  return this.level;
};

// Add experience and check for level up
userSchema.methods.addExperience = function(points) {
  this.experience += points;
  const oldLevel = this.level;
  this.calculateLevel();
  
  if (this.level > oldLevel) {
    return { leveledUp: true, newLevel: this.level };
  }
  return { leveledUp: false };
};

module.exports = mongoose.model('User', userSchema);
