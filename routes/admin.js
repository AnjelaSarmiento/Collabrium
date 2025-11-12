const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Post = require('../models/Post');
const Room = require('../models/Room');
const Wallet = require('../models/Wallet');
const Badge = require('../models/Badge');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Private (Admin)
router.get('/dashboard', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    // Get basic stats
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalPosts = await Post.countDocuments();
    const activePosts = await Post.countDocuments({ status: 'Open' });
    const totalRooms = await Room.countDocuments();
    const activeRooms = await Room.countDocuments({ status: 'Active' });

    // Get recent activity
    const recentUsers = await User.find()
      .select('name email createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentPosts = await Post.find()
      .populate('author', 'name')
      .select('title type createdAt status')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get wallet stats
    const wallets = await Wallet.find();
    const totalCollabPoints = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    const totalEarned = wallets.reduce((sum, wallet) => sum + wallet.totalEarned, 0);
    const totalSpent = wallets.reduce((sum, wallet) => sum + wallet.totalSpent, 0);

    // Get top users by points
    const topUsers = await User.find({ isActive: true })
      .select('name collabPoints level completedCollaborations')
      .sort({ collabPoints: -1 })
      .limit(10);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers
        },
        posts: {
          total: totalPosts,
          active: activePosts,
          completed: await Post.countDocuments({ status: 'Completed' }),
          cancelled: await Post.countDocuments({ status: 'Cancelled' })
        },
        rooms: {
          total: totalRooms,
          active: activeRooms,
          completed: await Room.countDocuments({ status: 'Completed' })
        },
        wallet: {
          totalPoints: totalCollabPoints,
          totalEarned,
          totalSpent,
          averageBalance: totalCollabPoints / wallets.length || 0
        }
      },
      recentActivity: {
        users: recentUsers,
        posts: recentPosts
      },
      topUsers
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination
// @access  Private (Admin)
router.get('/users', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.isActive = status === 'active';
    }

    let sortCriteria = {};
    switch (sortBy) {
      case 'points':
        sortCriteria = { collabPoints: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'collaborations':
        sortCriteria = { completedCollaborations: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'rating':
        sortCriteria = { rating: sortOrder === 'asc' ? 1 : -1 };
        break;
      default:
        sortCriteria = { createdAt: sortOrder === 'asc' ? 1 : -1 };
    }

    const users = await User.find(query)
      .select('-password')
      .populate('badges', 'name icon')
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Update user status
// @access  Private (Admin)
router.put('/users/:id/status', authenticateToken, authorizeAdmin, [
  body('isActive').isBoolean().withMessage('isActive must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/posts
// @desc    Get all posts with admin info
// @access  Private (Admin)
router.get('/posts', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const posts = await Post.find(query)
      .populate('author', 'name email')
      .populate('collaborators.user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    res.json({
      success: true,
      posts,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/admin/posts/:id
// @desc    Delete post (admin)
// @access  Private (Admin)
router.delete('/posts/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Refund escrow if it's a paid task
    if (post.type === 'Paid Task' && post.status === 'Open') {
      const wallet = await Wallet.findOne({ user: post.author });
      if (wallet) {
        wallet.refundEscrow(post._id);
        await wallet.save();
      }
    }

    await Post.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/transactions
// @desc    Get all transactions
// @access  Private (Admin)
router.get('/transactions', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, type, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    const wallets = await Wallet.find();
    let allTransactions = [];

    wallets.forEach(wallet => {
      wallet.transactions.forEach(transaction => {
        allTransactions.push({
          ...transaction.toObject(),
          userId: wallet.user
        });
      });
    });

    // Filter by type
    if (type) {
      allTransactions = allTransactions.filter(t => t.type === type);
    }

    // Filter by date range
    if (startDate || endDate) {
      allTransactions = allTransactions.filter(t => {
        const transactionDate = new Date(t.createdAt);
        if (startDate && transactionDate < new Date(startDate)) return false;
        if (endDate && transactionDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Sort by date
    allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const paginatedTransactions = allTransactions.slice(skip, skip + parseInt(limit));

    // Populate user data
    const populatedTransactions = await Promise.all(
      paginatedTransactions.map(async (transaction) => {
        const user = await User.findById(transaction.userId).select('name email');
        return {
          ...transaction,
          user
        };
      })
    );

    res.json({
      success: true,
      transactions: populatedTransactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(allTransactions.length / limit),
        total: allTransactions.length
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/admin/badges
// @desc    Create new badge
// @access  Private (Admin)
router.post('/badges', authenticateToken, authorizeAdmin, [
  body('name').notEmpty().withMessage('Badge name is required'),
  body('description').notEmpty().withMessage('Badge description is required'),
  body('icon').notEmpty().withMessage('Badge icon is required'),
  body('category').isIn(['Collaboration', 'Achievement', 'Streak', 'Special', 'Milestone']).withMessage('Invalid category'),
  body('requirements.type').isIn(['collaborations', 'points', 'streak', 'rating', 'custom']).withMessage('Invalid requirement type'),
  body('requirements.value').isInt({ min: 1 }).withMessage('Requirement value must be positive'),
  body('rarity').optional().isIn(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']).withMessage('Invalid rarity'),
  body('pointsReward').optional().isInt({ min: 0 }).withMessage('Points reward must be non-negative')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const badge = await Badge.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Badge created successfully',
      badge
    });
  } catch (error) {
    console.error('Create badge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/badges
// @desc    Get all badges
// @access  Private (Admin)
router.get('/badges', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const badges = await Badge.find()
      .populate('earnedBy.user', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      badges
    });
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/admin/badges/:id/award
// @desc    Award badge to user
// @access  Private (Admin)
router.post('/badges/:id/award', authenticateToken, authorizeAdmin, [
  body('userId').isMongoId().withMessage('Invalid user ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.body;
    const badge = await Badge.findById(req.params.id);
    
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Award badge
    const awarded = badge.awardToUser(userId);
    
    if (!awarded) {
      return res.status(400).json({
        success: false,
        message: 'User already has this badge'
      });
    }

    // Add badge to user
    user.badges.push({
      name: badge.name,
      description: badge.description,
      icon: badge.icon
    });

    // Add points reward if any
    if (badge.pointsReward > 0) {
      user.collabPoints += badge.pointsReward;
    }

    await badge.save();
    await user.save();

    res.json({
      success: true,
      message: 'Badge awarded successfully'
    });
  } catch (error) {
    console.error('Award badge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get platform analytics
// @access  Private (Admin)
router.get('/analytics', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // User growth
    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments({ createdAt: { $gte: startDate } });

    // Post activity
    const totalPosts = await Post.countDocuments();
    const newPosts = await Post.countDocuments({ createdAt: { $gte: startDate } });

    // Room activity
    const totalRooms = await Room.countDocuments();
    const newRooms = await Room.countDocuments({ createdAt: { $gte: startDate } });

    // Transaction volume
    const wallets = await Wallet.find();
    let totalVolume = 0;
    let recentVolume = 0;

    wallets.forEach(wallet => {
      wallet.transactions.forEach(transaction => {
        totalVolume += transaction.amount;
        if (transaction.createdAt >= startDate) {
          recentVolume += transaction.amount;
        }
      });
    });

    res.json({
      success: true,
      analytics: {
        period,
        users: {
          total: totalUsers,
          new: newUsers,
          growth: totalUsers > 0 ? ((newUsers / totalUsers) * 100).toFixed(2) : 0
        },
        posts: {
          total: totalPosts,
          new: newPosts,
          growth: totalPosts > 0 ? ((newPosts / totalPosts) * 100).toFixed(2) : 0
        },
        rooms: {
          total: totalRooms,
          new: newRooms,
          growth: totalRooms > 0 ? ((newRooms / totalRooms) * 100).toFixed(2) : 0
        },
        transactions: {
          totalVolume,
          recentVolume,
          growth: totalVolume > 0 ? ((recentVolume / totalVolume) * 100).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
