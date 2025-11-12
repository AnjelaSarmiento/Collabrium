const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Import models
const Badge = require('./models/Badge');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collabrium', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected for seeding'))
.catch(err => console.error('MongoDB connection error:', err));

// Seed badges
const seedBadges = async () => {
  try {
    // Clear existing badges
    await Badge.deleteMany({});

    const badges = [
      {
        name: 'First Steps',
        description: 'Complete your first collaboration',
        icon: '🥇',
        category: 'Milestone',
        requirements: {
          type: 'collaborations',
          value: 1,
          description: 'Complete 1 collaboration'
        },
        rarity: 'Common',
        pointsReward: 10
      },
      {
        name: 'Helpful Mentor',
        description: 'Complete 50 collaborations',
        icon: '🧩',
        category: 'Collaboration',
        requirements: {
          type: 'collaborations',
          value: 50,
          description: 'Complete 50 collaborations'
        },
        rarity: 'Rare',
        pointsReward: 100
      },
      {
        name: 'Collab Pro',
        description: 'Complete 100 collaboration sessions',
        icon: '🔥',
        category: 'Achievement',
        requirements: {
          type: 'collaborations',
          value: 100,
          description: 'Complete 100 collaborations'
        },
        rarity: 'Epic',
        pointsReward: 250
      },
      {
        name: 'Point Collector',
        description: 'Earn 1000 CollabPoints',
        icon: '💰',
        category: 'Achievement',
        requirements: {
          type: 'points',
          value: 1000,
          description: 'Earn 1000 CollabPoints'
        },
        rarity: 'Uncommon',
        pointsReward: 50
      },
      {
        name: 'High Rater',
        description: 'Maintain a 4.5+ rating',
        icon: '⭐',
        category: 'Achievement',
        requirements: {
          type: 'rating',
          value: 4.5,
          description: 'Maintain a 4.5+ rating'
        },
        rarity: 'Rare',
        pointsReward: 75
      },
      {
        name: 'Streak Master',
        description: 'Be active for 7 consecutive days',
        icon: '🔥',
        category: 'Streak',
        requirements: {
          type: 'streak',
          value: 7,
          description: 'Be active for 7 consecutive days'
        },
        rarity: 'Uncommon',
        pointsReward: 30
      },
      {
        name: 'Community Builder',
        description: 'Create 10 successful posts',
        icon: '🏗️',
        category: 'Special',
        requirements: {
          type: 'custom',
          value: 10,
          description: 'Create 10 successful posts'
        },
        rarity: 'Rare',
        pointsReward: 100
      },
      {
        name: 'Legendary Helper',
        description: 'Complete 500 collaborations',
        icon: '👑',
        category: 'Milestone',
        requirements: {
          type: 'collaborations',
          value: 500,
          description: 'Complete 500 collaborations'
        },
        rarity: 'Legendary',
        pointsReward: 1000
      }
    ];

    await Badge.insertMany(badges);
    console.log('Badges seeded successfully');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding badges:', error);
    process.exit(1);
  }
};

// Run seeding
seedBadges();
