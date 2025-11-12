const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  icon: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['Collaboration', 'Achievement', 'Streak', 'Special', 'Milestone'],
    required: true
  },
  requirements: {
    type: {
      type: String,
      enum: ['collaborations', 'points', 'streak', 'rating', 'custom'],
      required: true
    },
    value: {
      type: Number,
      required: true
    },
    description: String
  },
  rarity: {
    type: String,
    enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'],
    default: 'Common'
  },
  pointsReward: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  earnedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for better performance
badgeSchema.index({ category: 1 });
badgeSchema.index({ rarity: 1 });
badgeSchema.index({ isActive: 1 });

// Method to check if user can earn this badge
badgeSchema.methods.canEarn = function(user) {
  if (!this.isActive) return false;
  
  // Check if user already has this badge
  const alreadyEarned = this.earnedBy.some(
    earned => earned.user.toString() === user._id.toString()
  );
  
  if (alreadyEarned) return false;
  
  // Check requirements
  switch (this.requirements.type) {
    case 'collaborations':
      return user.completedCollaborations >= this.requirements.value;
    case 'points':
      return user.collabPoints >= this.requirements.value;
    case 'streak':
      // This would need to be calculated based on user activity
      return false; // Placeholder
    case 'rating':
      return user.rating >= this.requirements.value;
    default:
      return false;
  }
};

// Method to award badge to user
badgeSchema.methods.awardToUser = function(userId) {
  const alreadyEarned = this.earnedBy.some(
    earned => earned.user.toString() === userId.toString()
  );
  
  if (!alreadyEarned) {
    this.earnedBy.push({ user: userId });
    return true;
  }
  return false;
};

module.exports = mongoose.model('Badge', badgeSchema);
