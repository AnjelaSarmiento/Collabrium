const express = require('express');
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const Post = require('../models/Post');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/rooms
// @desc    Get user's rooms
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status = 'Active', limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const rooms = await Room.find({
      'participants.user': req.user._id,
      status
    })
      .populate('postId', 'title type reward')
      .populate('creator', 'name profilePicture')
      .populate('participants.user', 'name profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/rooms/:id/conversation
// @desc    Get conversation ID for a room
// @access  Private
// IMPORTANT: This route must be defined BEFORE /:id to ensure proper matching
router.get('/:id/conversation', authenticateToken, async (req, res) => {
  try {
    console.log('[Get Room Conversation] Request received:', {
      roomId: req.params.id,
      userId: req.user._id,
      path: req.path
    });
    
    const Conversation = require('../models/Conversation');
    const { ensureRoomConversation } = require('../utils/roomConversation');
    
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is a participant
    const isParticipant = room.participants.some(
      p => (p.user?._id || p.user || p).toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this room'
      });
    }

    // Ensure conversation exists
    const conversation = await ensureRoomConversation(room._id);
    
    res.json({
      success: true,
      conversationId: conversation._id.toString()
    });
  } catch (error) {
    console.error('Get room conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/rooms/:id
// @desc    Get single room
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('[Get Room] Request received:', {
      roomId: req.params.id,
      userId: req.user._id,
      method: req.method,
      path: req.path
    });

    // Validate ObjectId early
    const mongoose = require('mongoose');
    if (!mongoose.isValidObjectId(req.params.id)) {
      console.log('[Get Room] Invalid ObjectId:', req.params.id);
      return res.status(400).json({
        success: false,
        message: 'Invalid room id'
      });
    }

    // Fetch room without populate first to avoid any populate-related errors
    let room = await Room.findById(req.params.id)
      .select('name description postId creator participants chatMessages sharedFiles tasks status sessionStart')
      .lean(); // Use lean() to get plain JavaScript object, faster and avoids populate issues
    
    if (!room) {
      console.log('[Get Room] Room not found in database:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Manually populate if needed (optional, for better response data)
    // We'll populate after checking access to avoid errors
    try {
      if (room.postId) {
        const Post = require('../models/Post');
        const post = await Post.findById(room.postId).select('title description type reward tags').lean();
        if (post) {
          room.postId = post;
        }
      }
      if (room.creator) {
        const User = require('../models/User');
        const creator = await User.findById(room.creator).select('name profilePicture').lean();
        if (creator) {
          room.creator = creator;
        }
      }
      // Populate participants.user manually
      if (room.participants && Array.isArray(room.participants)) {
        const User = require('../models/User');
        const participantUserIds = room.participants
          .map(p => p.user)
          .filter(id => id);
        if (participantUserIds.length > 0) {
          const users = await User.find({ _id: { $in: participantUserIds } })
            .select('name profilePicture')
            .lean();
          const userMap = new Map(users.map(u => [u._id.toString(), u]));
          room.participants = room.participants.map(p => ({
            ...p,
            user: p.user && userMap.has(p.user.toString()) ? userMap.get(p.user.toString()) : p.user
          }));
        }
      }
    } catch (populateError) {
      console.warn('[Get Room] Error during manual populate (non-fatal):', populateError.message);
      // Continue without populate - room data is still valid
    }

    console.log('[Get Room] Room found:', {
      roomId: room._id,
      name: room.name,
      participantsCount: room.participants?.length || 0
    });

    // Check if user is participant (handle populated, ObjectId, or null safely)
    let isParticipant = false;
    try {
      if (room.participants && Array.isArray(room.participants)) {
        isParticipant = room.participants.some(participant => {
          if (!participant || !participant.user) return false;
          try {
            // If populated
            if (participant.user && participant.user._id) {
              return participant.user._id.toString() === req.user._id.toString();
            }
            // If ObjectId (string or ObjectId instance)
            if (participant.user) {
              const userId = typeof participant.user === 'string' 
                ? participant.user 
                : (participant.user.toString ? participant.user.toString() : String(participant.user));
              return userId === req.user._id.toString();
            }
          } catch (participantError) {
            console.warn('[Get Room] Error checking participant:', participantError);
            return false;
          }
          return false;
        });
      }
    } catch (participantCheckError) {
      console.error('[Get Room] Error in participant check:', participantCheckError);
      // Don't fail the request, just log the error
      isParticipant = false;
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this room'
      });
    }

    // Optional: if client later needs full details, we can add a ?full=1 to expand other populates

    res.json({
      success: true,
      room
    });
  } catch (error) {
    console.error('[Get Room] Error:', error);
    console.error('[Get Room] Error name:', error.name);
    console.error('[Get Room] Error message:', error.message);
    console.error('[Get Room] Error stack:', error.stack);
    if (error.errors) {
      console.error('[Get Room] Validation errors:', error.errors);
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/rooms/:id/join
// @desc    Join room
// @access  Private
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if room is active
    if (room.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Room is not active'
      });
    }

    // Add participant
    const added = room.addParticipant(req.user._id);
    
    if (!added) {
      return res.status(400).json({
        success: false,
        message: 'You are already a participant in this room'
      });
    }

    await room.save();

    res.json({
      success: true,
      message: 'Successfully joined the room',
      room
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/rooms/:id/leave
// @desc    Leave room
// @access  Private
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Don't allow creator to leave
    if (room.creator.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Creator cannot leave the room'
      });
    }

    // Remove participant
    room.removeParticipant(req.user._id);
    await room.save();

    res.json({
      success: true,
      message: 'Successfully left the room',
      room
    });
  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/rooms/:id/message
// @desc    Send message to room
// @access  Private
router.post('/:id/message', authenticateToken, [
  body('content').isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1 and 1000 characters'),
  body('messageType').optional().isIn(['text', 'file', 'image', 'code', 'system']).withMessage('Invalid message type')
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

    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is participant
    const isParticipant = room.participants.some(
      participant => participant.user.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this room'
      });
    }

    const { content, messageType = 'text', attachments = [] } = req.body;

    // Add message
    room.addMessage(req.user._id, content, messageType, attachments);
    await room.save();

    await room.populate('chatMessages.sender', 'name profilePicture');

    const newMessage = room.chatMessages[room.chatMessages.length - 1];

    res.json({
      success: true,
      message: 'Message sent successfully',
      chatMessage: newMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/rooms/:id/share-file
// @desc    Share file in room
// @access  Private
router.post('/:id/share-file', authenticateToken, [
  body('filename').notEmpty().withMessage('Filename is required'),
  body('url').notEmpty().withMessage('File URL is required'),
  body('fileType').notEmpty().withMessage('File type is required'),
  body('size').isInt({ min: 0 }).withMessage('File size must be a positive integer')
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

    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is participant
    const isParticipant = room.participants.some(
      participant => participant.user.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this room'
      });
    }

    const { filename, url, fileType, size } = req.body;

    // Add shared file
    room.addSharedFile(filename, url, fileType, size, req.user._id);
    await room.save();

    res.json({
      success: true,
      message: 'File shared successfully',
      sharedFile: room.sharedFiles[room.sharedFiles.length - 1]
    });
  } catch (error) {
    console.error('Share file error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/rooms/:id/task
// @desc    Add task to room
// @access  Private
router.post('/:id/task', authenticateToken, [
  body('title').isLength({ min: 1, max: 200 }).withMessage('Task title must be between 1 and 200 characters'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('assignedTo').optional().isMongoId().withMessage('Invalid assigned user ID'),
  body('priority').optional().isIn(['Low', 'Medium', 'High']).withMessage('Invalid priority level')
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

    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is creator or helper
    const userRole = room.participants.find(
      participant => participant.user.toString() === req.user._id.toString()
    )?.role;

    if (!userRole || userRole === 'Observer') {
      return res.status(403).json({
        success: false,
        message: 'Only creators and helpers can add tasks'
      });
    }

    const { title, description, assignedTo, priority = 'Medium' } = req.body;

    // Validate assigned user is a participant
    if (assignedTo) {
      const isParticipant = room.participants.some(
        participant => participant.user.toString() === assignedTo
      );
      
      if (!isParticipant) {
        return res.status(400).json({
          success: false,
          message: 'Assigned user must be a room participant'
        });
      }
    }

    // Add task
    room.addTask(title, description, assignedTo, priority);
    await room.save();

    res.json({
      success: true,
      message: 'Task added successfully',
      task: room.tasks[room.tasks.length - 1]
    });
  } catch (error) {
    console.error('Add task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/rooms/:id/task/:taskId
// @desc    Update task status
// @access  Private
router.put('/:id/task/:taskId', authenticateToken, [
  body('status').isIn(['Pending', 'In Progress', 'Completed']).withMessage('Invalid task status')
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

    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const task = room.tasks.id(req.params.taskId);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check if user can update this task
    const canUpdate = task.assignedTo?.toString() === req.user._id.toString() || 
                     room.creator.toString() === req.user._id.toString();

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'You can only update tasks assigned to you or if you are the room creator'
      });
    }

    const { status } = req.body;
    task.status = status;
    
    if (status === 'Completed') {
      task.completedAt = new Date();
    }

    await room.save();

    res.json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/rooms/:id/complete
// @desc    Complete room and distribute rewards
// @access  Private
router.post('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is creator
    if (room.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the room creator can complete the room'
      });
    }

    // Check if room is already completed
    if (room.status === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'Room is already completed'
      });
    }

    // Complete room
    room.completeRoom();

    // Get post to check if it's a paid task
    const post = await Post.findById(room.postId);
    
    if (post && post.type === 'Paid Task' && post.reward && !room.rewardDistributed) {
      // Distribute rewards to helpers
      const helpers = room.participants.filter(p => p.role === 'Helper');
      const rewardPerHelper = Math.floor(post.reward / helpers.length);
      
      for (const helper of helpers) {
        const helperWallet = await Wallet.findOne({ user: helper.user });
        if (helperWallet) {
          helperWallet.addTransaction('Earn', rewardPerHelper, `Reward for completing: ${post.title}`, req.user._id, post._id, room._id);
          await helperWallet.save();
        }

        room.rewardDistribution.push({
          user: helper.user,
          amount: rewardPerHelper
        });

        // Update user stats
        const user = await User.findById(helper.user);
        if (user) {
          user.completedCollaborations += 1;
          user.addExperience(10); // 10 XP per collaboration
          await user.save();
        }
      }

      room.rewardDistributed = true;

      // Release escrow
      const creatorWallet = await Wallet.findOne({ user: req.user._id });
      if (creatorWallet) {
        creatorWallet.releaseEscrow(post._id, req.user._id);
        await creatorWallet.save();
      }
    }

    // Update post status
    if (post) {
      post.status = 'Completed';
      post.completedAt = new Date();
      await post.save();
    }

    await room.save();

    res.json({
      success: true,
      message: 'Room completed successfully',
      room
    });
  } catch (error) {
    console.error('Complete room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/rooms/:id/whiteboard
// @desc    Update whiteboard data
// @access  Private
router.put('/:id/whiteboard', authenticateToken, [
  body('data').notEmpty().withMessage('Whiteboard data is required')
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

    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is participant
    const isParticipant = room.participants.some(
      participant => participant.user.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not a participant in this room'
      });
    }

    const { data } = req.body;
    room.whiteboardData = JSON.stringify(data);
    await room.save();

    res.json({
      success: true,
      message: 'Whiteboard updated successfully'
    });
  } catch (error) {
    console.error('Update whiteboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
