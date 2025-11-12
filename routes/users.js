const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const User = require('../models/User');
const Post = require('../models/Post');
const Room = require('../models/Room');
const Wallet = require('../models/Wallet');
const { authenticateToken, checkOwnership, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const fs = require('fs');

// @route   GET /api/users/online-status
// @desc    Get online status for all users (both online and offline)
// @access  Public
router.get('/online-status', async (req, res) => {
  try {
    const activeUsers = req.app.locals.activeUsers || new Map();
    const statuses = {};
    
    // Add online users from activeUsers Map (don't send lastSeen for online users)
    for (const [userId, data] of activeUsers.entries()) {
      statuses[userId] = {
        status: data.status,
        lastSeen: null // Online users don't need lastSeen
      };
    }
    
    // For offline users (not in activeUsers Map), get lastSeen from database
    // Get all users who are currently offline (not in activeUsers)
    const offlineUserIds = await User.find({
      _id: { $nin: Array.from(activeUsers.keys()) }
    }).select('_id lastSeen');
    
    offlineUserIds.forEach(user => {
      statuses[user._id.toString()] = {
        status: 'offline',
        lastSeen: user.lastSeen ? user.lastSeen.toISOString() : null
      };
    });
    
    res.json({
      success: true,
      statuses
    });
  } catch (error) {
    console.error('Failed to get online status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/profile-pictures/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// @route   GET /api/users/profile/:userId
// @desc    Get user profile
// @access  Public
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('badges', 'name description icon earnedAt')
      .select('-password -email');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's posts (exclude soft-deleted)
    const posts = await Post.find({ author: req.params.userId, isDeleted: false })
      .populate('author', 'name profilePicture')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get user's completed collaborations
    const completedRooms = await Room.find({
      'participants.user': req.params.userId,
      status: 'Completed'
    }).countDocuments();

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        posts,
        completedCollaborations: completedRooms
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===== Connections API =====
// @route   GET /api/users/relationship/:userId
// @desc    Get relationship status with current user
// @access  Private (optionalAuth to allow unauthenticated?)
router.get('/relationship/:userId', optionalAuth, async (req, res) => {
  try {
    const viewerId = req.user?._id; // may be undefined if not using auth middleware here
    const targetId = req.params.userId;

    if (!viewerId) {
      return res.json({ success: true, status: 'none' });
    }

    const viewer = await User.findById(viewerId).select('connections connectionRequests sentRequests');
    if (!viewer) return res.json({ success: true, status: 'none' });

    if (viewerId.toString() === targetId.toString()) return res.json({ success: true, status: 'self' });
    if (viewer.connections.some(id => id.toString() === targetId)) return res.json({ success: true, status: 'connected' });
    if (viewer.sentRequests.some(id => id.toString() === targetId)) return res.json({ success: true, status: 'outgoing' });
    if (viewer.connectionRequests.some(id => id.toString() === targetId)) return res.json({ success: true, status: 'incoming' });

    return res.json({ success: true, status: 'none' });
  } catch (e) {
    console.error('relationship error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/connect/:userId
// @desc    Send connection request (or cancel if already outgoing)
// @access  Private
router.post('/connect/:userId', authenticateToken, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const target = await User.findById(req.params.userId);
    if (!me || !target) return res.status(404).json({ success: false, message: 'User not found' });
    if (me._id.toString() === target._id.toString()) return res.status(400).json({ success: false, message: 'Cannot connect to yourself' });

    // already connected -> remove connection
    const alreadyConnected = me.connections.some(id => id.toString() === target._id.toString());
    if (alreadyConnected) {
      me.connections = me.connections.filter(id => id.toString() !== target._id.toString());
      target.connections = target.connections.filter(id => id.toString() !== me._id.toString());
      await me.save();
      await target.save();
      const io = req.app.get('io');
      if (io) io.emit('social:update', { userIds: [me._id.toString(), target._id.toString()], action: 'disconnected' });
      return res.json({ success: true, action: 'disconnected' });
    }

    // if outgoing exists -> cancel
    const hasOutgoing = me.sentRequests.some(id => id.toString() === target._id.toString());
    if (hasOutgoing) {
      me.sentRequests = me.sentRequests.filter(id => id.toString() !== target._id.toString());
      target.connectionRequests = target.connectionRequests.filter(id => id.toString() !== me._id.toString());
      await me.save();
      await target.save();
      const io = req.app.get('io');
      if (io) io.emit('social:update', { userIds: [me._id.toString(), target._id.toString()], action: 'request_cancelled' });
      return res.json({ success: true, action: 'request_cancelled' });
    }

    // if incoming exists -> accept
    const hasIncoming = me.connectionRequests.some(id => id.toString() === target._id.toString());
    if (hasIncoming) {
      me.connectionRequests = me.connectionRequests.filter(id => id.toString() !== target._id.toString());
      target.sentRequests = target.sentRequests.filter(id => id.toString() !== me._id.toString());
      me.connections.push(target._id);
      target.connections.push(me._id);
      await me.save();
      await target.save();
      const io = req.app.get('io');
      if (io) io.emit('social:update', { userIds: [me._id.toString(), target._id.toString()], action: 'accepted' });
      return res.json({ success: true, action: 'accepted' });
    }

    // otherwise send request
    if (!me.sentRequests.some(id => id.toString() === target._id.toString())) me.sentRequests.push(target._id);
    if (!target.connectionRequests.some(id => id.toString() === me._id.toString())) target.connectionRequests.push(me._id);
    await me.save();
    await target.save();
    const io = req.app.get('io');
    if (io) io.emit('social:update', { userIds: [me._id.toString(), target._id.toString()], action: 'request_sent' });
    
    // Emit notification to recipient
    const { NotificationEmitter } = require('../utils/notifications');
    await NotificationEmitter.connectionRequest(req, target._id.toString(), {
      _id: me._id,
      name: me.name,
      profilePicture: me.profilePicture
    });
    
    res.json({ success: true, action: 'request_sent' });
  } catch (e) {
    console.error('connect error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/:userId/block
// @desc    Block or unblock a user
// @access  Private
router.post('/:userId/block', authenticateToken, async (req, res) => {
  console.log('[Users] Block route hit:', req.params.userId, req.body);
  try {
    const targetId = req.params.userId;
    const requesterId = req.user._id.toString();
    const { block } = req.body || {};

    if (targetId === requesterId) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    const [requester, target] = await Promise.all([
      User.findById(requesterId),
      User.findById(targetId)
    ]);

    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const shouldBlock = typeof block === 'boolean' ? block : true;
    const isBlocked = requester.blockedUsers?.some(id => id.toString() === targetId) || false;

    if (shouldBlock && !isBlocked) {
      requester.blockedUsers = requester.blockedUsers || [];
      requester.blockedUsers.push(target._id);

      // Remove any existing social connections/requests in both directions
      requester.connections = (requester.connections || []).filter(id => id.toString() !== targetId);
      requester.connectionRequests = (requester.connectionRequests || []).filter(id => id.toString() !== targetId);
      requester.sentRequests = (requester.sentRequests || []).filter(id => id.toString() !== targetId);

      target.connections = (target.connections || []).filter(id => id.toString() !== requesterId);
      target.connectionRequests = (target.connectionRequests || []).filter(id => id.toString() !== requesterId);
      target.sentRequests = (target.sentRequests || []).filter(id => id.toString() !== requesterId);

      await target.save();
    } else if (!shouldBlock && isBlocked) {
      requester.blockedUsers = requester.blockedUsers.filter(id => id.toString() !== targetId);
    }

    await requester.save();

    res.json({
      success: true,
      status: shouldBlock ? 'blocked' : 'unblocked'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/accept/:userId
// @desc    Accept incoming request
// @access  Private
router.post('/accept/:userId', authenticateToken, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const from = await User.findById(req.params.userId);
    if (!me || !from) return res.status(404).json({ success: false, message: 'User not found' });

    // ensure incoming exists
    if (!me.connectionRequests.some(id => id.toString() === from._id.toString())) {
      return res.status(400).json({ success: false, message: 'No pending request' });
    }

    me.connectionRequests = me.connectionRequests.filter(id => id.toString() !== from._id.toString());
    from.sentRequests = from.sentRequests.filter(id => id.toString() !== me._id.toString());
    me.connections.push(from._id);
    from.connections.push(me._id);
    await me.save();
    await from.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('social:update', { userIds: [me._id.toString(), from._id.toString()], action: 'accepted' });
    }
    
    // Delete connection_request notification(s) from the current user (recipient)
    const Notification = require('../models/Notification');
    try {
      const deletedResult = await Notification.deleteMany({
        recipient: me._id,
        type: 'connection_request',
        $or: [
          { 'metadata.userId': from._id.toString() },
          { actor: from._id }
        ]
      });
      console.log(`[Accept Connection] Deleted ${deletedResult.deletedCount} connection_request notification(s) for user ${me._id}`);
    } catch (deleteError) {
      console.error('[Accept Connection] Failed to delete connection_request notifications:', deleteError);
      // Continue even if delete fails
    }
    
    // Emit notification to the person who originally sent the request
    const { sendNotification } = require('../utils/notifications');
    await sendNotification(req, {
      type: 'connection_accepted',
      recipientId: from._id.toString(),
      actor: {
      _id: me._id,
      name: me.name,
      profilePicture: me.profilePicture
      },
      metadata: { userId: me._id.toString() }
    });
    
    // Emit refresh event to update notification counts
    if (io) {
      io.to(`user:${me._id}`).emit('notifications:refresh-count');
    }
    
    res.json({ 
      success: true, 
      action: 'accepted',
      deletedNotificationIds: [] // For backwards compatibility
    });
  } catch (e) {
    console.error('[Accept Connection] Error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/decline/:userId
// @desc    Decline incoming request
// @access  Private
router.post('/decline/:userId', authenticateToken, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const from = await User.findById(req.params.userId);
    if (!me || !from) return res.status(404).json({ success: false, message: 'User not found' });
    
    me.connectionRequests = me.connectionRequests.filter(id => id.toString() !== from._id.toString());
    from.sentRequests = from.sentRequests.filter(id => id.toString() !== me._id.toString());
    await me.save();
    await from.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('social:update', { userIds: [me._id.toString(), from._id.toString()], action: 'declined' });
    }
    
    // Delete connection_request notification(s) from the current user (recipient)
    const Notification = require('../models/Notification');
    try {
      const deletedResult = await Notification.deleteMany({
        recipient: me._id,
        type: 'connection_request',
        $or: [
          { 'metadata.userId': from._id.toString() },
          { actor: from._id }
        ]
      });
      console.log(`[Decline Connection] Deleted ${deletedResult.deletedCount} connection_request notification(s) for user ${me._id}`);
    } catch (deleteError) {
      console.error('[Decline Connection] Failed to delete connection_request notifications:', deleteError);
      // Continue even if delete fails
    }
    
    // Emit refresh event to update notification counts
    if (io) {
      io.to(`user:${me._id}`).emit('notifications:refresh-count');
    }
    
    res.json({ 
      success: true, 
      action: 'declined',
      deletedNotificationIds: [] // For backwards compatibility
    });
  } catch (e) {
    console.error('[Decline Connection] Error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/:userId/report
// @desc    Report a user
// @access  Private
router.post('/:userId/report', authenticateToken, async (req, res) => {
  console.log('[Users] Report route hit:', req.params.userId, req.body);
  try {
    const targetId = req.params.userId;
    const reporterId = req.user._id.toString();
    const { reason, details } = req.body || {};

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A reason for the report is required'
      });
    }

    if (targetId === reporterId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report yourself'
      });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const existingReport = (target.reports || []).find(report => report.reporter.toString() === reporterId);

    if (existingReport) {
      // Update existing report with latest details
      existingReport.reason = reason.slice(0, 200);
      existingReport.details = details ? details.slice(0, 1000) : '';
      existingReport.createdAt = new Date();
    } else {
      target.reports = target.reports || [];
      target.reports.push({
        reporter: req.user._id,
        reason: reason.slice(0, 200),
        details: details ? details.slice(0, 1000) : ''
      });
    }

    await target.save();

    res.json({
      success: true,
      message: 'Report submitted successfully'
    });
  } catch (error) {
    console.error('Report user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/users/connect/:userId
// @desc    Remove connection
router.delete('/connect/:userId', authenticateToken, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    const target = await User.findById(req.params.userId);
    if (!me || !target) return res.status(404).json({ success: false, message: 'User not found' });
    me.connections = me.connections.filter(id => id.toString() !== target._id.toString());
    target.connections = target.connections.filter(id => id.toString() !== me._id.toString());
    await me.save();
    await target.save();
    const io = req.app.get('io');
    if (io) io.emit('social:update', { userIds: [me._id.toString(), target._id.toString()], action: 'disconnected' });
    res.json({ success: true, action: 'disconnected' });
  } catch (e) {
    console.error('disconnect error', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Lists
router.get('/connections/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('connections', 'name profilePicture');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, connections: user.connections });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('connectionRequests', 'name profilePicture')
      .populate('sentRequests', 'name profilePicture');
    res.json({ success: true, incoming: user.connectionRequests, outgoing: user.sentRequests });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, (req, res, next) => {
  upload.single('profilePicture')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
}, [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
  body('skills').optional().isString().withMessage('Skills must be a string'),
  body('availability').optional().isIn(['Online', 'Busy', 'Accepting Paid Tasks', 'Offline']).withMessage('Invalid availability status')
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

    const { name, bio, skills, availability } = req.body;
    const updateData = {};

    console.log('Profile update request:', { name, bio, skills, availability, file: req.file });

    if (name) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    if (skills) {
      try {
        // Try to parse as JSON first
        updateData.skills = JSON.parse(skills);
      } catch (e) {
        // If JSON parsing fails, treat as comma-separated string
        updateData.skills = skills.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
      }
    }
    if (availability) updateData.availability = availability;

    console.log('Update data:', updateData);

    // Handle profile picture upload
    if (req.file) {
      updateData.profilePicture = req.file.filename;
      console.log('Profile picture filename saved:', updateData.profilePicture);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    console.log('Final user object:', user);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/users/profile-picture
// @desc    Update profile picture
// @access  Private
router.post('/profile-picture', authenticateToken, async (req, res) => {
  try {
    const { profilePicture } = req.body;

    if (!profilePicture) {
      return res.status(400).json({
        success: false,
        message: 'Profile picture URL is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      user
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/search
// @desc    Search users by skills or name
// @access  Public
router.get('/search', async (req, res) => {
  try {
    const { q, skill, limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    let query = { isActive: true };

    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { bio: { $regex: q, $options: 'i' } }
      ];
    }

    if (skill) {
      query.skills = { $in: [new RegExp(skill, 'i')] };
    }

    const users = await User.find(query)
      .select('name profilePicture skills availability rating completedCollaborations')
      .sort({ rating: -1, completedCollaborations: -1 })
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
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/leaderboard
// @desc    Get leaderboard
// @access  Public
router.get('/leaderboard', async (req, res) => {
  try {
    const { type = 'points', limit = 50 } = req.query;

    let sortCriteria = {};
    switch (type) {
      case 'points':
        sortCriteria = { collabPoints: -1 };
        break;
      case 'collaborations':
        sortCriteria = { completedCollaborations: -1 };
        break;
      case 'rating':
        sortCriteria = { rating: -1 };
        break;
      case 'level':
        sortCriteria = { level: -1, experience: -1 };
        break;
      default:
        sortCriteria = { collabPoints: -1 };
    }

    const users = await User.find({ isActive: true })
      .select('name profilePicture collabPoints level completedCollaborations rating badges')
      .populate('badges', 'name icon')
      .sort(sortCriteria)
      .limit(parseInt(limit));

    res.json({
      success: true,
      leaderboard: users.map((user, index) => ({
        rank: index + 1,
        ...user.toObject()
      }))
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/users/review/:userId
// @desc    Add review for user
// @access  Private
router.post('/review/:userId', authenticateToken, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters')
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

    const { rating, comment } = req.body;
    const targetUserId = req.params.userId;

    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot review yourself'
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user already reviewed this user
    const existingReview = user.reviews.find(
      review => review.reviewer.toString() === req.user._id.toString()
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this user'
      });
    }

    // Add review
    user.reviews.push({
      reviewer: req.user._id,
      rating,
      comment
    });

    // Recalculate average rating
    const totalRating = user.reviews.reduce((sum, review) => sum + review.rating, 0);
    user.rating = totalRating / user.reviews.length;

    await user.save();

    res.json({
      success: true,
      message: 'Review added successfully',
      user: {
        rating: user.rating,
        reviewCount: user.reviews.length
      }
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/achievements/:userId
// @desc    Get user achievements
// @access  Public
router.get('/achievements/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('badges', 'name description icon rarity earnedAt')
      .select('badges level experience collabPoints completedCollaborations');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      achievements: {
        badges: user.badges,
        level: user.level,
        experience: user.experience,
        collabPoints: user.collabPoints,
        completedCollaborations: user.completedCollaborations
      }
    });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
