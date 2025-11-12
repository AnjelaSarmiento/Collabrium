const express = require('express');
const { body, validationResult } = require('express-validator');
const Post = require('../models/Post');
const Room = require('../models/Room');
const Wallet = require('../models/Wallet');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/posts
// @desc    Get all posts with filtering and pagination
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      tag,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minReward,
      maxReward,
      status
    } = req.query;

    const skip = (page - 1) * limit;
    let query = {};

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by tags
    if (tag) {
      query.tags = { $in: [new RegExp(tag, 'i')] };
    }

    // Search in title and description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Filter by reward range
    if (minReward || maxReward) {
      query.reward = {};
      if (minReward) query.reward.$gte = parseInt(minReward);
      if (maxReward) query.reward.$lte = parseInt(maxReward);
    }

    // Sort options
    let sortCriteria = {};
    switch (sortBy) {
      case 'reward':
        sortCriteria = { reward: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'upvotes':
        sortCriteria = { upvoteCount: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'comments':
        sortCriteria = { commentCount: sortOrder === 'asc' ? 1 : -1 };
        break;
      case 'views':
        sortCriteria = { views: sortOrder === 'asc' ? 1 : -1 };
        break;
      default:
        sortCriteria = { createdAt: sortOrder === 'asc' ? 1 : -1 };
    }

    const posts = await Post.findActive(query)
      .populate('author', 'name profilePicture rating completedCollaborations')
      .populate('collaborators.user', 'name profilePicture')
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit));

    // Filter out posts with null authors (deleted users)
    const validPosts = posts.filter(post => post.author !== null);

    const total = await Post.countDocuments({ ...query, isDeleted: false });

    res.json({
      success: true,
      posts: validPosts,
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

// @route   GET /api/posts/saved
// @desc    Get user's saved posts
// @access  Private
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    console.log('Get saved posts request received:', {
      userId: req.user._id,
      userEmail: req.user.email
    });
    
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const User = require('../models/User');
    const user = await User.findById(req.user._id).populate({
      path: 'savedPosts',
      match: { isDeleted: false },
      populate: {
        path: 'author',
        select: 'name profilePicture rating completedCollaborations'
      }
    });

    if (!user) {
      console.log('User not found for saved posts:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('User saved posts:', user.savedPosts.map(post => post ? post._id : 'null'));

    // Filter out null posts (deleted posts) and posts with null authors
    const savedPosts = user.savedPosts.filter(post => post !== null && post.author !== null);
    const total = savedPosts.length;
    const paginatedPosts = savedPosts.slice(skip, skip + parseInt(limit));

    console.log('Returning saved posts:', paginatedPosts.length, 'out of', total);

    res.json({
      success: true,
      posts: paginatedPosts,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get saved posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/posts/:id
// @desc    Get single post
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, isDeleted: false })
      .populate('author', 'name profilePicture rating completedCollaborations skills')
      .populate('collaborators.user', 'name profilePicture')
      .populate('comments.author', 'name profilePicture')
      .populate('comments.replies.author', 'name profilePicture');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Increment view count
    post.views += 1;
    await post.save();

    // Log roomId for debugging
    if (post.roomId) {
      console.log('[Get Post] Post has roomId:', {
        postId: post._id,
        roomId: post.roomId,
        roomIdType: typeof post.roomId,
        roomIdString: String(post.roomId)
      });
      
      // Verify room exists
      const Room = require('../models/Room');
      const roomExists = await Room.exists({ _id: post.roomId });
      console.log('[Get Post] Room exists check:', {
        roomId: post.roomId,
        exists: !!roomExists
      });
    }

    res.json({
      success: true,
      post
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts
// @desc    Create new post
// @access  Private
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('type').isIn(['Free Collaboration', 'Paid Task']).withMessage('Type must be either Free Collaboration or Paid Task'),
  body('reward').optional().isInt({ min: 1 }).withMessage('Reward must be a positive integer'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('deadline').optional().isISO8601().withMessage('Deadline must be a valid date')
], async (req, res) => {
  try {
    console.log('Create post request received:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      description,
      type,
      reward,
      tags = [],
      attachments = [],
      deadline,
      isUrgent,
      maxCollaborators = 0,
      collabOpen = true
    } = req.body;
    console.log('Processing post creation for user:', req.user._id);

    // Validate reward for paid tasks
    if (type === 'Paid Task' && (!reward || reward < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Paid tasks must have a reward of at least 1 CollabPoint'
      });
    }

    // Check if user has sufficient balance for paid tasks
    if (type === 'Paid Task') {
      const wallet = await Wallet.findOne({ user: req.user._id });
      if (!wallet || !wallet.hasSufficientBalance(reward)) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient CollabPoints balance'
        });
      }
    }

    const post = await Post.create({
      title,
      description,
      type,
      reward: type === 'Paid Task' ? reward : undefined,
      tags,
      attachments,
      author: req.user._id,
      deadline,
      isUrgent,
      maxCollaborators: typeof maxCollaborators === 'number' ? maxCollaborators : 0,
      collabOpen: typeof collabOpen === 'boolean' ? collabOpen : true
    });

    // Hold funds in escrow for paid tasks
    if (type === 'Paid Task') {
      const wallet = await Wallet.findOne({ user: req.user._id });
      wallet.holdEscrow(post._id, reward);
      await wallet.save();
    }

    await post.populate('author', 'name profilePicture rating');

    // Smart notification: Only notify connections with high engagement
    try {
      const { getPrioritizedConnections, isUserMentioned } = require('../utils/engagementScore');
      const { emitNotification } = require('../utils/notifications');
      const io = req.app.get('io');
      
      if (io) {
        // Get connections that should be notified (score >= 50, stricter threshold)
        const prioritizedConnections = await getPrioritizedConnections(req.user._id.toString(), 50);
        
        // Also check post content for mentions
        const postContent = `${title} ${description}`.toLowerCase();
        
        // Get all connections to check for mentions
        const User = require('../models/User');
        const poster = await User.findById(req.user._id).select('connections');
        const allConnections = poster?.connections || [];

        // Notify prioritized connections
        for (const connection of prioritizedConnections) {
          const isMentioned = await isUserMentioned(postContent, connection.userId);
          
          if (isMentioned || connection.score >= 50) {
            // Always notify if mentioned, or if engagement score is high enough (50+)
            await emitNotification(req, {
              type: 'post_created',
              recipientId: connection.userId,
              actor: {
                _id: req.user._id,
                name: req.user.name,
                profilePicture: req.user.profilePicture
              },
              metadata: {
                postId: post._id.toString(),
                title: post.title,
                isMentioned,
                engagementScore: connection.score
              }
            });
          }
        }

        // Also notify any connections mentioned in the post (even if low engagement)
        for (const connectionId of allConnections) {
          const connectionIdStr = connectionId.toString();
          
          // Skip if already notified as prioritized
          if (prioritizedConnections.some(c => c.userId === connectionIdStr)) {
            continue;
          }

          const isMentioned = await isUserMentioned(postContent, connectionIdStr);
          if (isMentioned) {
            await emitNotification(req, {
              type: 'post_created',
              recipientId: connectionIdStr,
              actor: {
                _id: req.user._id,
                name: req.user.name,
                profilePicture: req.user.profilePicture
              },
              metadata: {
                postId: post._id.toString(),
                title: post.title,
                isMentioned: true
              }
            });
          }
        }

        console.log(`[Post Notification] Notified ${prioritizedConnections.length} prioritized connections for post ${post._id}`);
      }
    } catch (notifError) {
      // Don't fail post creation if notification fails
      console.error('[Post Creation] Error sending smart notifications:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/posts/:id
// @desc    Update post
// @access  Private
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check ownership
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own posts'
      });
    }

    // Allow limited updates when collaborators exist:
    // - Always allow changing collabOpen and maxCollaborators
    // - Block title/description/tags/deadline/isUrgent changes if collaborators exist
    const { title, description, tags, deadline, isUrgent, maxCollaborators, collabOpen } = req.body;
    const hasNonCollabEdits =
      (title !== undefined) ||
      (description !== undefined) ||
      (tags !== undefined) ||
      (deadline !== undefined) ||
      (isUrgent !== undefined);
    
    if (post.collaborators.length > 0 && hasNonCollabEdits) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change core post fields once collaborators have joined'
      });
    }

    // Build update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined) updateData.tags = tags;
    if (deadline !== undefined) updateData.deadline = deadline;
    if (isUrgent !== undefined) updateData.isUrgent = isUrgent;
    if (collabOpen !== undefined) updateData.collabOpen = !!collabOpen;

    // Validate and set maxCollaborators
    if (maxCollaborators !== undefined) {
      const max = parseInt(maxCollaborators, 10);
      if (Number.isNaN(max) || max < 0) {
        return res.status(400).json({
          success: false,
          message: 'maxCollaborators must be a non-negative integer'
        });
      }
      updateData.maxCollaborators = max;
      // If reduced below current approved, keep collaborators but auto-close requests
      const currentApproved = post.collaborators.length;
      if (max > 0 && currentApproved > max) {
        updateData.collabOpen = false;
      }
    }

    const updatedPost = await Post.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).populate('author', 'name profilePicture rating');

    res.json({
      success: true,
      message: 'Post updated successfully',
      post: updatedPost
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/posts/:id
// @desc    Soft delete post (move to bin)
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Delete request received:', {
      postId: req.params.id,
      userId: req.user._id,
      userEmail: req.user.email
    });
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      console.log('Post not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    console.log('Post found:', {
      postId: post._id,
      authorId: post.author,
      isDeleted: post.isDeleted,
      title: post.title
    });

    // Check ownership
    if (post.author.toString() !== req.user._id.toString()) {
      console.log('Ownership check failed:', {
        postAuthor: post.author.toString(),
        userId: req.user._id.toString()
      });
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own posts'
      });
    }

    // Check if already deleted
    if (post.isDeleted) {
      console.log('Post already deleted');
      return res.status(400).json({
        success: false,
        message: 'Post is already deleted'
      });
    }

    // Refund escrow if it's a paid task
    if (post.type === 'Paid Task' && post.status === 'Open') {
      const wallet = await Wallet.findOne({ user: req.user._id });
      if (wallet) {
        wallet.refundEscrow(post._id);
        await wallet.save();
      }
    }

    // Soft delete the post
    console.log('Performing soft delete...');
    await post.softDelete(req.user._id);
    console.log('Soft delete completed');

    res.json({
      success: true,
      message: 'Post moved to bin successfully'
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/join
// @desc    Join post as collaborator (DEPRECATED - Use request-collaboration instead)
// @access  Private
// NOTE: This endpoint is kept for backward compatibility but should use request-collaboration
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    console.log('Join request received:', { postId: req.params.id, userId: req.user._id });
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      console.log('Post not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    console.log('Post found:', { postId: post._id, authorId: post.author, status: post.status });

    // Check if user is the author
    if (post.author.toString() === req.user._id.toString()) {
      console.log('User trying to join their own post');
      return res.status(400).json({
        success: false,
        message: 'You cannot join your own post'
      });
    }

    // Validate collaboration acceptance based on collabOpen and maxCollaborators
    const currentApproved = Array.isArray(post.collaborators) ? post.collaborators.length : 0;
    const max = typeof post.maxCollaborators === 'number' ? post.maxCollaborators : 0; // 0 => unlimited
    const isFull = max > 0 && currentApproved >= max;
    const isAccepting = post.collabOpen && !isFull;
    if (!isAccepting) {
      return res.status(400).json({
        success: false,
        message: isFull
          ? 'This post has reached the maximum number of collaborators'
          : 'This post is not currently accepting collaboration requests'
      });
    }

    // Add collaborator
    const added = post.addCollaborator(req.user._id);
    
    if (!added) {
      return res.status(400).json({
        success: false,
        message: 'You are already a collaborator on this post'
      });
    }

    await post.save();

    res.json({
      success: true,
      message: 'Successfully joined the collaboration',
      post
    });
  } catch (error) {
    console.error('Join post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/request-collaboration
// @desc    Send collaboration request to post owner
// @access  Private
router.post('/:id/request-collaboration', authenticateToken, async (req, res) => {
  try {
    const CollaborationRequest = require('../models/CollaborationRequest');
    const { sendNotification } = require('../utils/notifications');
    
    const post = await Post.findById(req.params.id).populate('author', 'name profilePicture');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the author
    if (post.author._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request to collaborate on your own post'
      });
    }

    // Validate collaboration acceptance based on collabOpen and maxCollaborators
    const currentApproved = Array.isArray(post.collaborators) ? post.collaborators.length : 0;
    const max = typeof post.maxCollaborators === 'number' ? post.maxCollaborators : 0; // 0 => unlimited
    const isFull = max > 0 && currentApproved >= max;
    const isAccepting = (post.collabOpen ?? true) && !isFull;
    if (!isAccepting) {
      return res.status(400).json({
        success: false,
        message: isFull
          ? 'This post has reached the maximum number of collaborators'
          : 'This post is not currently accepting collaboration requests'
      });
    }

    // Check if user is already a collaborator
    const isAlreadyCollaborator = post.collaborators.some(
      collab => collab.user.toString() === req.user._id.toString()
    );
    
    if (isAlreadyCollaborator) {
      return res.status(400).json({
        success: false,
        message: 'You are already a collaborator on this post'
      });
    }

    // Check if there's already a pending request
    const existingRequest = await CollaborationRequest.findOne({
      post: post._id,
      requester: req.user._id,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending collaboration request for this post'
      });
    }

    // Check if there's an approved request (user was already approved)
    const approvedRequest = await CollaborationRequest.findOne({
      post: post._id,
      requester: req.user._id,
      status: 'approved'
    });

    if (approvedRequest) {
      return res.status(400).json({
        success: false,
        message: 'Your collaboration request has already been approved'
      });
    }

    // Create collaboration request
    const request = await CollaborationRequest.create({
      post: post._id,
      requester: req.user._id,
      postOwner: post.author._id,
      status: 'pending'
    });

    // Populate requester for response
    await request.populate('requester', 'name profilePicture');

    // Send notification to post owner
    try {
      await sendNotification(req, {
        type: 'collaboration_request',
        recipientId: post.author._id.toString(),
        actor: req.user,
        metadata: {
          postId: post._id.toString(),
          requestId: request._id.toString(),
          title: post.title
        }
      });
    } catch (notifError) {
      console.error('[Collaboration Request] Error sending notification:', notifError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      message: 'Collaboration request sent successfully',
      request: {
        _id: request._id,
        post: request.post,
        requester: request.requester,
        status: request.status,
        requestedAt: request.requestedAt
      }
    });
  } catch (error) {
    console.error('Request collaboration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/posts/:id/my-request
// @desc    Get current user's collaboration request status for a post
// @access  Private
router.get('/:id/my-request', authenticateToken, async (req, res) => {
  try {
    const CollaborationRequest = require('../models/CollaborationRequest');
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const request = await CollaborationRequest.findOne({
      post: post._id,
      requester: req.user._id
    }).sort({ createdAt: -1 }); // Get most recent request

    res.json({
      success: true,
      request: request ? {
        _id: request._id,
        status: request.status,
        requestedAt: request.requestedAt,
        respondedAt: request.respondedAt
      } : null
    });
  } catch (error) {
    console.error('Get my request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/posts/:id/cancel-request/:requestId
// @desc    Cancel a pending collaboration request (requester only)
// @access  Private
router.delete('/:id/cancel-request/:requestId', authenticateToken, async (req, res) => {
  try {
    const CollaborationRequest = require('../models/CollaborationRequest');
    
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }
    
    const request = await CollaborationRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Collaboration request not found'
      });
    }
    
    // Only the requester can cancel their request
    if (request.requester.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own collaboration requests'
      });
    }
    
    if (request.post.toString() !== post._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Request does not belong to this post'
      });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Only pending requests can be cancelled (current: ${request.status})`
      });
    }
    
    // For simplicity, delete the pending request (removes it from UI lists)
    await CollaborationRequest.deleteOne({ _id: request._id });
    
    res.json({
      success: true,
      message: 'Collaboration request cancelled'
    });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/posts/:id/requests
// @desc    Get all pending collaboration requests for a post (post owner only)
// @access  Private
router.get('/:id/requests', authenticateToken, async (req, res) => {
  try {
    const CollaborationRequest = require('../models/CollaborationRequest');
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the post owner
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the post owner can view collaboration requests'
      });
    }

    const requests = await CollaborationRequest.find({
      post: post._id,
      status: 'pending'
    })
      .populate('requester', 'name profilePicture rating completedCollaborations')
      .sort({ requestedAt: -1 });

    res.json({
      success: true,
      requests: requests.map(req => ({
        _id: req._id,
        requester: req.requester,
        status: req.status,
        requestedAt: req.requestedAt
      }))
    });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/approve-request/:requestId
// @desc    Approve a collaboration request
// @access  Private
router.post('/:id/approve-request/:requestId', authenticateToken, async (req, res) => {
  try {
    const CollaborationRequest = require('../models/CollaborationRequest');
    const Room = require('../models/Room');
    const { sendNotification } = require('../utils/notifications');
    
    const post = await Post.findById(req.params.id).populate('author', 'name profilePicture');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the post owner
    if (post.author._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the post owner can approve collaboration requests'
      });
    }

    const request = await CollaborationRequest.findById(req.params.requestId)
      .populate('requester', 'name profilePicture');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Collaboration request not found'
      });
    }

    // Check if request belongs to this post
    if (request.post.toString() !== post._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Request does not belong to this post'
      });
    }

    // Check if request is already processed
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request has already been ${request.status}`
      });
    }

    // Update request status
    request.status = 'approved';
    request.respondedAt = new Date();
    await request.save();

    // Add user as collaborator
    const added = post.addCollaborator(request.requester._id);
    if (!added) {
      // User might already be a collaborator (edge case)
      console.warn('[Approve Request] User already a collaborator:', request.requester._id);
    }
    
    // Save post to ensure collaborators array is updated before creating room
    await post.save();

    // If maxCollaborators is set and reached after this approval, auto-close requests
    const currentApproved = Array.isArray(post.collaborators) ? post.collaborators.length : 0;
    const max = typeof post.maxCollaborators === 'number' ? post.maxCollaborators : 0;
    if (max > 0 && currentApproved >= max) {
      post.collabOpen = false;
    }

    // Auto-create room if it doesn't exist yet (when first collaborator is approved)
    let room = null;
    if (!post.roomId) {
      console.log('[Approve Request] Auto-creating room for post:', post._id);
      
      // Extract ObjectIds (post.author might be populated, collaborators.user might be populated or string)
      const creatorId = post.author._id || post.author;
      
      // Build participants array - ensure we have ObjectIds, not populated objects
      const participants = [
        { user: creatorId, role: 'Creator' }
      ];
      
      // Add all collaborators as Helpers
      // Note: post.collaborators might not be populated, so collab.user could be ObjectId or populated object
      for (const collab of post.collaborators) {
        let userId;
        if (typeof collab.user === 'string') {
          userId = collab.user;
        } else if (collab.user && collab.user._id) {
          userId = collab.user._id;
        } else {
          userId = collab.user; // Already an ObjectId
        }
        
        // Only add if not already in participants (avoid duplicates)
        if (!participants.some(p => p.user.toString() === userId.toString())) {
          participants.push({ user: userId, role: 'Helper' });
        }
      }

      console.log('[Approve Request] Creating room with participants:', participants.map(p => ({ user: p.user.toString(), role: p.role })));

      // Validate room name length (Room schema max is 100 chars)
      const roomName = post.title.length > 100 ? post.title.substring(0, 97) + '...' : post.title;
      // Validate room description length (Room schema max is 500 chars)
      const roomDescription = post.description && post.description.length > 500 
        ? post.description.substring(0, 497) + '...' 
        : post.description;

      try {
        room = await Room.create({
          name: roomName,
          description: roomDescription,
          postId: post._id,
          creator: creatorId,
          participants: participants,
          status: 'Active'
        });
      } catch (roomError) {
        console.error('[Approve Request] Room creation failed:', roomError);
        console.error('[Approve Request] Room creation error details:', {
          name: roomName,
          description: roomDescription ? roomDescription.substring(0, 50) + '...' : null,
          postId: post._id,
          creatorId: creatorId,
          participantsCount: participants.length,
          participants: participants.map(p => ({ user: p.user?.toString(), role: p.role }))
        });
        throw roomError; // Re-throw to be caught by outer catch
      }

      // Link room to post
      post.roomId = room._id;
      post.status = 'In Progress'; // Update post status when room is created
      
      // Create conversation for room
      try {
        const { ensureRoomConversation } = require('../utils/roomConversation');
        const conversation = await ensureRoomConversation(room._id);
        console.log('[Approve Request] Created conversation for room:', {
          roomId: room._id,
          conversationId: conversation._id
        });
      } catch (convError) {
        console.error('[Approve Request] Failed to create conversation for room:', convError);
        // Don't fail the request if conversation creation fails
      }
      
      console.log('[Approve Request] Room created successfully:', {
        roomId: room._id,
        postId: post._id,
        roomName: room.name
      });
    } else {
      // Room already exists, just add the new participant
      room = await Room.findById(post.roomId);
      if (room) {
        const isParticipant = room.participants.some(
          p => p.user.toString() === request.requester._id.toString()
        );
        if (!isParticipant) {
          room.addParticipant(request.requester._id, 'Helper');
          await room.save();
          console.log('[Approve Request] Added user to existing room:', request.requester._id);
          
          // Sync participants to conversation
          try {
            const { syncRoomParticipantsToConversation } = require('../utils/roomConversation');
            await syncRoomParticipantsToConversation(room._id);
          } catch (convError) {
            console.error('[Approve Request] Failed to sync participants to conversation:', convError);
          }
        }
      }
    }

    await post.save();
    console.log('[Approve Request] Post saved with roomId:', {
      postId: post._id,
      roomId: post.roomId,
      roomIdType: typeof post.roomId
    });

    // Refresh post to get updated data including roomId
    const updatedPost = await Post.findById(post._id)
      .populate('collaborators.user', 'name profilePicture')
      .populate('author', 'name profilePicture rating completedCollaborations');
    
    console.log('[Approve Request] Refreshed post roomId:', {
      postId: updatedPost._id,
      roomId: updatedPost.roomId,
      roomIdType: typeof updatedPost.roomId
    });

    // Send notification to requester
    try {
      await sendNotification(req, {
        type: 'collaboration_request_approved',
        recipientId: request.requester._id.toString(),
        actor: req.user,
        metadata: {
          postId: post._id.toString(),
          requestId: request._id.toString(),
          title: post.title,
          roomId: updatedPost.roomId ? updatedPost.roomId.toString() : null
        }
      });
    } catch (notifError) {
      console.error('[Approve Request] Error sending notification:', notifError);
      // Don't fail if notification fails
    }

    res.json({
      success: true,
      message: 'Collaboration request approved successfully',
      post: updatedPost,
      room: room ? {
        _id: room._id,
        name: room.name,
        status: room.status
      } : null,
      request: {
        _id: request._id,
        status: request.status,
        respondedAt: request.respondedAt
      }
    });
  } catch (error) {
    console.error('Approve request error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    // If it's a validation error, provide more details
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + Object.keys(error.errors).map(key => error.errors[key].message).join(', '),
        errors: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      errorName: process.env.NODE_ENV === 'development' ? error.name : undefined
    });
  }
});

// @route   POST /api/posts/:id/decline-request/:requestId
// @desc    Decline a collaboration request
// @access  Private
router.post('/:id/decline-request/:requestId', authenticateToken, async (req, res) => {
  try {
    const CollaborationRequest = require('../models/CollaborationRequest');
    const { sendNotification } = require('../utils/notifications');
    
    const post = await Post.findById(req.params.id).populate('author', 'name profilePicture');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the post owner
    if (post.author._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the post owner can decline collaboration requests'
      });
    }

    const request = await CollaborationRequest.findById(req.params.requestId)
      .populate('requester', 'name profilePicture');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Collaboration request not found'
      });
    }

    // Check if request belongs to this post
    if (request.post.toString() !== post._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Request does not belong to this post'
      });
    }

    // Check if request is already processed
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request has already been ${request.status}`
      });
    }

    // Update request status
    request.status = 'declined';
    request.respondedAt = new Date();
    await request.save();

    // Send notification to requester
    try {
      await sendNotification(req, {
        type: 'collaboration_request_declined',
        recipientId: request.requester._id.toString(),
        actor: req.user,
        metadata: {
          postId: post._id.toString(),
          requestId: request._id.toString(),
          title: post.title
        }
      });
    } catch (notifError) {
      console.error('[Decline Request] Error sending notification:', notifError);
      // Don't fail if notification fails
    }

    res.json({
      success: true,
      message: 'Collaboration request declined',
      request: {
        _id: request._id,
        status: request.status,
        respondedAt: request.respondedAt
      }
    });
  } catch (error) {
    console.error('Decline request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/remove-collaborator/:userId
// @desc    Owner removes a collaborator from a post (and room if present)
// @access  Private
router.post('/:id/remove-collaborator/:userId', authenticateToken, async (req, res) => {
  console.log('[remove-collaborator] Route hit:', {
    postId: req.params.id,
    userId: req.params.userId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl
  });
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Only author can remove collaborators
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the post owner can remove collaborators' });
    }

    const targetUserId = req.params.userId;
    // Prevent removing author
    if (post.author.toString() === targetUserId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot remove the post owner' });
    }

    const wasCollaborator = post.collaborators.some(c => (c.user?.toString ? c.user.toString() : c.user?._id?.toString()) === targetUserId.toString());
    if (!wasCollaborator) {
      return res.status(404).json({ success: false, message: 'User is not a collaborator on this post' });
    }

    // Remove collaborator from post
    post.removeCollaborator(targetUserId);
    await post.save();

    // Also remove from room participants if room exists
    if (post.roomId) {
      const Room = require('../models/Room');
      const room = await Room.findById(post.roomId);
      if (room) {
        try {
          room.removeParticipant(targetUserId);
          await room.save();
        } catch (e) {
          console.warn('[remove-collaborator] Failed to remove from room participants:', e?.message);
        }
      }
    }

    // Return updated post data
    const updatedPost = await Post.findById(post._id)
      .populate('collaborators.user', 'name profilePicture')
      .populate('author', 'name profilePicture rating completedCollaborations');

    res.json({
      success: true,
      message: 'Collaborator removed successfully',
      post: updatedPost
    });
  } catch (error) {
    console.error('Remove collaborator error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/posts/:id/leave
// @desc    Leave post collaboration
// @access  Private
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Remove collaborator
    post.removeCollaborator(req.user._id);
    await post.save();

    res.json({
      success: true,
      message: 'Successfully left the collaboration',
      post
    });
  } catch (error) {
    console.error('Leave post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/save
// @desc    Save/unsave post
// @access  Private
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    console.log('Save request received:', {
      postId: req.params.id,
      userId: req.user._id,
      userEmail: req.user.email
    });
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      console.log('Post not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post is deleted
    if (post.isDeleted) {
      console.log('Post is deleted, cannot save');
      return res.status(400).json({
        success: false,
        message: 'Cannot save deleted post'
      });
    }

    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    
    if (!user) {
      console.log('User not found:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const postId = post._id;
    const isSaved = user.savedPosts.some(savedPostId => savedPostId.toString() === postId.toString());
    
    console.log('Current saved posts:', user.savedPosts.map(id => id.toString()));
    console.log('Post ID:', postId.toString());
    console.log('Is saved:', isSaved);

    if (isSaved) {
      // Remove from saved posts
      user.savedPosts = user.savedPosts.filter(id => id.toString() !== postId.toString());
      await user.save();
      console.log('Post removed from saved');
      
      res.json({
        success: true,
        message: 'Post removed from saved',
        saved: false
      });
    } else {
      // Add to saved posts
      user.savedPosts.push(postId);
      await user.save();
      console.log('Post added to saved');
      
      res.json({
        success: true,
        message: 'Post saved successfully',
        saved: true
      });
    }
  } catch (error) {
    console.error('Save post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/upvote
// @desc    Upvote post
// @access  Private
router.post('/:id/upvote', authenticateToken, async (req, res) => {
  try {
    console.log('Upvote request received:', { postId: req.params.id, userId: req.user._id });
    
    const post = await Post.findById(req.params.id)
      .populate('author', 'name profilePicture');
    
    if (!post) {
      console.log('Post not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    console.log('Post found:', { postId: post._id, currentUpvotes: post.upvotes.length });

    const { getId } = require('../utils/notifications');
    const upvoted = post.upvote(req.user._id);
    const currentUserId = getId(req.user);
    
    if (!upvoted) {
      // Remove upvote if already upvoted
      console.log('User already upvoted, removing upvote');
      post.removeUpvote(req.user._id);
      await post.save();
      
      console.log('Upvote removed, new count:', post.upvoteCount);
    } else {
      console.log('Adding new upvote');
      await post.save();
      console.log('Upvote added, new count:', post.upvoteCount);
    }

    // Emit real-time update event for BOTH upvote and un-upvote
    // This ensures UI updates immediately for all viewers
    const io = req.app.get('io');
    if (io) {
      const payload = {
        postId: post._id.toString(),
        type: 'post',
        targetType: 'post', // Add for consistency
        targetId: post._id.toString(),
        upvoted: upvoted, // true or false
        upvoteCount: post.upvoteCount,
        userId: currentUserId
      };
      
      // Emit to post room (all viewers)
      io.to(`post:${post._id}`).emit('reaction:updated', payload);
      console.log(`[Post Upvote] ✅ Emitted reaction:updated to post:${post._id}, upvoted: ${upvoted}, count: ${post.upvoteCount}`);
      
      // Also emit to post owner's personal room
      const postOwnerId = getId(post.author);
      if (postOwnerId) {
        io.to(`user:${postOwnerId}`).emit('reaction:updated', payload);
        console.log(`[Post Upvote] ✅ Emitted reaction:updated to user:${postOwnerId}, upvoted: ${upvoted}, count: ${post.upvoteCount}`);
      }
    }

    // Emit notification to post author ONLY when upvoting (not when removing upvote)
    // Handle both populated and unpopulated author
    if (upvoted) {
      const postAuthorId = getId(post.author);
      
      console.log('[Post Upvote] Checking notification:', {
        postAuthorId,
        currentUserId,
        shouldNotify: postAuthorId && postAuthorId !== currentUserId
      });
      
      if (postAuthorId && postAuthorId !== currentUserId) {
        const { sendNotification } = require('../utils/notifications');
        console.log('[Post Upvote] ✅ Sending notification to post author:', postAuthorId);
        try {
          await sendNotification(req, {
            type: 'post_reaction_added',
            recipientId: postAuthorId,
            actor: {
              _id: req.user._id,
              name: req.user.name,
              profilePicture: req.user.profilePicture
            },
            metadata: {
              postId: post._id.toString()
            }
          });
          console.log('[Post Upvote] ✅ Notification sent successfully');
        } catch (notifError) {
          console.error('[Post Upvote] ❌ Error sending notification:', notifError);
        }
      } else {
        console.log('[Post Upvote] ⚠️ Skipping notification - user upvoted their own post or invalid post author');
      }
    }

    res.json({
      success: true,
      message: upvoted ? 'Post upvoted successfully' : 'Upvote removed',
      upvoteCount: post.upvoteCount,
      upvoted: upvoted
    });
  } catch (error) {
    console.error('Upvote post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/comment
// @desc    Add comment to post
// @access  Private
router.post('/:id/comment', authenticateToken, [
  body('content').isLength({ min: 1, max: 500 }).withMessage('Comment must be between 1 and 500 characters')
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

    const post = await Post.findById(req.params.id)
      .populate('author', 'name profilePicture');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const { content } = req.body;

    post.comments.push({
      author: req.user._id,
      content
    });

    await post.save();
    await post.populate('comments.author', 'name profilePicture');

    const newComment = post.comments[post.comments.length - 1];
    const postOwnerName = post.author?.name || 'Unknown';
    const { sendNotification, getId } = require('../utils/notifications');

    // Emit notification to post author (if commenter is not the post author)
    const postAuthorId = getId(post.author);
    const currentUserId = getId(req.user);
    
    console.log('[Post Comment] Checking notification:', {
      postAuthorId,
      currentUserId,
      shouldNotify: postAuthorId && postAuthorId !== currentUserId
    });
    
    if (postAuthorId && postAuthorId !== currentUserId) {
      console.log('[Post Comment] ✅ Sending notification to post author:', postAuthorId);
      try {
        await sendNotification(req, {
          type: 'comment_added',
          recipientId: postAuthorId,
          actor: {
            _id: req.user._id,
            name: req.user.name,
            profilePicture: req.user.profilePicture
          },
          metadata: {
            postId: post._id.toString(),
            commentId: newComment._id.toString(),
            preview: content?.substring(0, 120),
            postOwnerName
          }
        });
        console.log('[Post Comment] ✅ Notification sent successfully');
      } catch (notifError) {
        console.error('[Post Comment] ❌ Error sending notification:', notifError);
      }
    } else {
      console.log('[Post Comment] ⚠️ Skipping notification - user commented on their own post or invalid post author');
    }

    // Emit real-time update to all users viewing this post (for UI refresh only, not notifications)
    const io = req.app.get('io');
    if (io) {
      const payload = {
        type: 'comment_added',
        postId: post._id.toString(),
        commentId: newComment._id.toString()
      };
      // Emit to post room so all viewers receive the update for UI refresh
      // This is NOT a notification event - it's just for refreshing the post view
      io.to(`post:${post._id}`).emit('post:activity', payload);
      console.log('[Post Comment] ✅ Emitted real-time update to post room:', `post:${post._id}`);
    }

    res.json({
      success: true,
      message: 'Comment added successfully',
      comment: newComment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/comment/:commentId/reply
// @desc    Add reply to comment
// @access  Private
router.post('/:id/comment/:commentId/reply', authenticateToken, [
  body('content').isLength({ min: 1, max: 300 }).withMessage('Reply must be between 1 and 300 characters')
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

    const post = await Post.findById(req.params.id)
      .populate('author', 'name profilePicture');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const { content, replyTo } = req.body;

    // Prepare reply object
    const replyData = {
      author: req.user._id,
      content
    };

    // Track if this is a reply to a reply
    const isReplyToReply = replyTo && replyTo.replyId;
    const replyToUserId = replyTo?.userId || null;

    // Add replyTo information if provided
    if (replyTo) {
      replyData.replyTo = {
        userId: replyTo.userId,
        userName: replyTo.userName,
        replyId: replyTo.replyId || null
      };
    }

    comment.replies.push(replyData);

    await post.save();
    // Populate both comment authors and reply authors for proper notification logic
    await post.populate('comments.author', 'name profilePicture');
    await post.populate('comments.replies.author', 'name profilePicture');

    const newReply = comment.replies[comment.replies.length - 1];
    const postOwnerName = post.author?.name || 'Unknown';
    const { sendNotification, getId } = require('../utils/notifications');

    // Determine recipients for notifications using dedupe approach
    // Get the comment again after population to ensure author is populated
    const populatedComment = post.comments.id(req.params.commentId);
    const commentAuthorId = getId(populatedComment.author);
    const postAuthorId = getId(post.author);
    const currentUserId = getId(req.user);
    
    // Build recipient map: recipientId -> { recipientType, metadata }
    const recipients = new Map();
    
    // Helper to add recipient if valid
    const addRecipientIfValid = (recipientId, recipientType, metadata) => {
      const recipientIdStr = getId(recipientId);
      if (!recipientIdStr || recipientIdStr === currentUserId) {
        return false; // Skip null/invalid or self
      }
      
      // Only add if not already in map (dedupe)
      if (!recipients.has(recipientIdStr)) {
        recipients.set(recipientIdStr, { recipientType, metadata });
        return true;
      }
      return false;
    };
    
    console.log('[Post Reply] Building recipient list:', {
      commentAuthorId,
      postAuthorId,
      currentUserId,
      replyToUserId,
      isReplyToReply
    });
    
    // 1. Always notify comment owner (if different from current user)
    // Note: If comment owner is also reply owner, their role will be upgraded to reply_owner later
    // Set isReplyToReply based on whether this is a reply-to-reply (affects message format)
    if (commentAuthorId) {
      addRecipientIfValid(commentAuthorId, 'comment_owner', {
        postId: post._id.toString(),
        commentId: comment._id.toString(),
        replyId: newReply._id.toString(),
        preview: content?.substring(0, 120),
        postOwnerName,
        isReplyToReply: isReplyToReply, // Set based on whether this is a reply-to-reply
        replyToUserId: isReplyToReply ? replyToUserId : null
      });
    }
    
    // 2. Notify post owner (if different from current user)
    // Post owner should ALWAYS be notified when someone replies to any comment on their post
    // Note: If post owner is also comment owner or reply owner, they'll get the more specific role (prioritized later)
    // Set isReplyToReply based on whether this is a reply-to-reply (affects message format)
    if (postAuthorId) {
      // Add as post_owner, but if they're already a recipient, they'll get upgraded to a more specific role later
      addRecipientIfValid(postAuthorId, 'post_owner', {
        postId: post._id.toString(),
        commentId: comment._id.toString(),
        replyId: newReply._id.toString(),
        preview: content?.substring(0, 120),
        postOwnerName,
        isReplyToReply: isReplyToReply, // Set based on whether this is a reply-to-reply
        replyToUserId: isReplyToReply ? replyToUserId : null
      });
    }
    
    // 3. If reply-to-reply: notify reply owner (if different from current user)
    // Reply owner should ALWAYS be notified when someone replies to their reply
    // Priority: reply_owner > comment_owner > post_owner (most specific role wins)
    if (isReplyToReply && replyToUserId) {
      const replyOwnerIdStr = getId(replyToUserId);
      if (replyOwnerIdStr && replyOwnerIdStr !== currentUserId) {
        // Get the actual reply being replied to to verify ownership
        const repliedToReply = populatedComment.replies.id(replyTo.replyId);
        const actualReplyOwnerId = getId(repliedToReply?.author || replyOwnerIdStr);
        
        if (actualReplyOwnerId && actualReplyOwnerId !== currentUserId) {
          if (!recipients.has(actualReplyOwnerId)) {
            // New recipient - add as reply_owner
            recipients.set(actualReplyOwnerId, {
              recipientType: 'reply_owner',
              metadata: {
                postId: post._id.toString(),
                commentId: comment._id.toString(),
                replyId: newReply._id.toString(),
                preview: content?.substring(0, 120),
                postOwnerName,
                isReplyToReply: true,
                replyToUserId: String(actualReplyOwnerId)
              }
            });
          } else {
            // Reply owner is already a recipient (e.g., also comment owner or post owner)
            // Prioritize reply_owner role (most specific) and update metadata
            const existing = recipients.get(actualReplyOwnerId);
            existing.recipientType = 'reply_owner'; // Override with more specific role
            existing.metadata.isReplyToReply = true;
            existing.metadata.replyToUserId = String(actualReplyOwnerId);
          }
        }
      }
    }
    
    console.log('[Post Reply] Final recipients:', Array.from(recipients.entries()).map(([id, data]) => ({
      recipientId: id,
      recipientType: data.recipientType
    })));
    
    // Send notifications to all recipients
    const actor = {
      _id: req.user._id,
      name: req.user.name,
      profilePicture: req.user.profilePicture
    };
    
    for (const [recipientId, { recipientType, metadata }] of recipients.entries()) {
      try {
        // Check if recipient is also the post owner (for correct message formatting)
        const isRecipientPostOwner = recipientId === postAuthorId;
        
        await sendNotification(req, {
          type: 'reply_added',
          recipientId,
          actor,
          metadata: {
            ...metadata,
            recipientType, // Ensure recipientType is in metadata
            isRecipientPostOwner // Flag to indicate if recipient is the post owner
          }
        });
        console.log(`[Post Reply] ✅ Sent notification to ${recipientType}:`, recipientId, `(isPostOwner: ${isRecipientPostOwner})`);
      } catch (error) {
        console.error(`[Post Reply] ❌ Failed to send notification to ${recipientId}:`, error);
      }
    }

    // Emit real-time update to all users viewing this post (for UI refresh only, not notifications)
    const io = req.app.get('io');
    if (io) {
      const payload = {
        type: 'reply_added',
        postId: post._id.toString(),
        commentId: comment._id.toString(),
        replyId: newReply._id.toString()
      };
      // Emit to post room so all viewers receive the update for UI refresh
      // This is NOT a notification event - it's just for refreshing the post view
      io.to(`post:${post._id}`).emit('post:activity', payload);
      console.log('[Post Reply] ✅ Emitted real-time update to post room:', `post:${post._id}`);
    }

    res.json({
      success: true,
      message: 'Reply added successfully',
      reply: newReply
    });
  } catch (error) {
    console.error('Add reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/comment/:commentId/upvote
// @desc    Upvote/remove upvote from comment
// @access  Private
router.post('/:id/comment/:commentId/upvote', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name profilePicture');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Initialize upvotes array if it doesn't exist
    if (!comment.upvotes) {
      comment.upvotes = [];
    }

    const { getId, sendNotification } = require('../utils/notifications');
    const currentUserId = getId(req.user);
    
    // Check if user already upvoted
    const existingUpvote = comment.upvotes.find(
      upvote => upvote.user.toString() === currentUserId
    );

    let upvoted;
    if (existingUpvote) {
      // Remove upvote
      post.removeCommentUpvote(req.params.commentId, req.user._id);
      upvoted = false;
    } else {
      // Add upvote
      post.upvoteComment(req.params.commentId, req.user._id);
      upvoted = true;
    }

    await post.save();

    // Get updated comment after save
    const updatedPost = await Post.findById(req.params.id);
    const updatedComment = updatedPost.comments.id(req.params.commentId);
    const upvoteCount = updatedComment.upvotes ? updatedComment.upvotes.length : 0;
    
    // Emit real-time update event for BOTH upvote and un-upvote
    // This ensures UI updates immediately for all viewers
    const io = req.app.get('io');
    if (io) {
      const payload = {
        postId: post._id.toString(),
        type: 'comment',
        targetType: 'comment',
        targetId: req.params.commentId,
        commentId: req.params.commentId,
        upvoted: upvoted, // true or false
        upvoteCount: upvoteCount,
        userId: currentUserId
      };
      
      // Emit to post room (all viewers)
      io.to(`post:${post._id}`).emit('reaction:updated', payload);
      console.log(`[Comment Upvote] ✅ Emitted reaction:updated to post:${post._id}, upvoted: ${upvoted}, count: ${upvoteCount}`);
      
      // Also emit to post owner and comment owner's personal rooms
      const postOwnerId = getId(post.author);
      if (postOwnerId) {
        io.to(`user:${postOwnerId}`).emit('reaction:updated', payload);
        console.log(`[Comment Upvote] ✅ Emitted reaction:updated to user:${postOwnerId}`);
      }
      
      const commentOwnerId = getId(comment.author);
      if (commentOwnerId) {
        io.to(`user:${commentOwnerId}`).emit('reaction:updated', payload);
        console.log(`[Comment Upvote] ✅ Emitted reaction:updated to user:${commentOwnerId}`);
      }
    }
    
    // Emit notification to comment author ONLY when upvoting (not when removing upvote)
    // Do NOT notify post owner for upvotes on others' comments
    if (upvoted) {
      const commentOwnerId = getId(comment.author);
      if (commentOwnerId && commentOwnerId !== currentUserId) {
        const postOwnerName = post.author?.name || 'Unknown';
        try {
          await sendNotification(req, {
            type: 'reaction_added',
            recipientId: commentOwnerId,
            actor: {
              _id: req.user._id,
              name: req.user.name,
              profilePicture: req.user.profilePicture
            },
            metadata: {
              postId: post._id.toString(),
              commentId: comment._id.toString(),
              replyId: null,
              postOwnerName
            }
          });
          console.log(`[Comment Upvote] ✅ Sent notification to comment owner: ${commentOwnerId}`);
        } catch (notifError) {
          console.error('[Comment Upvote] ❌ Error sending notification:', notifError);
        }
      }
    }

    res.json({
      success: true,
      message: upvoted ? 'Comment upvoted' : 'Comment upvote removed',
      upvoted,
      upvoteCount: updatedComment.upvotes ? updatedComment.upvotes.length : 0
    });
  } catch (error) {
    console.error('Comment upvote error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/comment/:commentId/reply/:replyId/upvote
// @desc    Upvote/remove upvote from reply
// @access  Private
router.post('/:id/comment/:commentId/reply/:replyId/upvote', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found'
      });
    }

    // Initialize upvotes array if it doesn't exist
    if (!reply.upvotes) {
      reply.upvotes = [];
    }

    const { getId, sendNotification } = require('../utils/notifications');
    const currentUserId = getId(req.user);
    await post.populate('comments.author', 'name profilePicture');
    await post.populate('comments.replies.author', 'name profilePicture');
    
    // Get fresh references after population
    const populatedComment = post.comments.id(req.params.commentId);
    const populatedReply = populatedComment.replies.id(req.params.replyId);

    // Check if user already upvoted
    const existingUpvote = populatedReply.upvotes.find(
      upvote => getId(upvote.user) === currentUserId
    );

    let upvoted;
    if (existingUpvote) {
      // Remove upvote
      post.removeReplyUpvote(req.params.commentId, req.params.replyId, req.user._id);
      upvoted = false;
    } else {
      // Add upvote
      post.upvoteReply(req.params.commentId, req.params.replyId, req.user._id);
      upvoted = true;
    }

    await post.save();

    // Get updated reply after save
    const updatedPost = await Post.findById(req.params.id);
    const updatedComment = updatedPost.comments.id(req.params.commentId);
    const updatedReply = updatedComment.replies.id(req.params.replyId);
    const upvoteCount = updatedReply.upvotes ? updatedReply.upvotes.length : 0;
    
    // Emit real-time update event for BOTH upvote and un-upvote
    // This ensures UI updates immediately for all viewers
    const io = req.app.get('io');
    if (io) {
      const payload = {
        postId: post._id.toString(),
        type: 'reply',
        targetType: 'reply',
        targetId: req.params.replyId,
        commentId: req.params.commentId,
        replyId: req.params.replyId,
        upvoted: upvoted, // true or false
        upvoteCount: upvoteCount,
        userId: currentUserId
      };
      
      // Emit to post room (all viewers)
      io.to(`post:${post._id}`).emit('reaction:updated', payload);
      console.log(`[Reply Upvote] ✅ Emitted reaction:updated to post:${post._id}, upvoted: ${upvoted}, count: ${upvoteCount}`);
      
      // Also emit to post owner, comment owner, and reply owner's personal rooms
      const postOwnerId = getId(post.author);
      if (postOwnerId) {
        io.to(`user:${postOwnerId}`).emit('reaction:updated', payload);
        console.log(`[Reply Upvote] ✅ Emitted reaction:updated to user:${postOwnerId}`);
      }
      
      const commentOwnerId = getId(populatedComment.author);
      if (commentOwnerId) {
        io.to(`user:${commentOwnerId}`).emit('reaction:updated', payload);
        console.log(`[Reply Upvote] ✅ Emitted reaction:updated to user:${commentOwnerId}`);
      }
      
      const replyOwnerId = getId(populatedReply.author);
      if (replyOwnerId) {
        io.to(`user:${replyOwnerId}`).emit('reaction:updated', payload);
        console.log(`[Reply Upvote] ✅ Emitted reaction:updated to user:${replyOwnerId}`);
      }
    }
    
    // Emit notification to reply author ONLY when upvoting (not when removing upvote)
    // Do NOT notify post owner for upvotes on others' replies
    if (upvoted) {
      const replyOwnerId = getId(populatedReply.author);
      if (replyOwnerId && replyOwnerId !== currentUserId) {
        const postOwnerName = post.author?.name || 'Unknown';
        try {
          await sendNotification(req, {
            type: 'reaction_added',
            recipientId: replyOwnerId,
            actor: {
              _id: req.user._id,
              name: req.user.name,
              profilePicture: req.user.profilePicture
            },
            metadata: {
              postId: post._id.toString(),
              commentId: comment._id.toString(),
              replyId: req.params.replyId,
              postOwnerName
            }
          });
          console.log(`[Reply Upvote] ✅ Sent notification to reply owner: ${replyOwnerId}`);
        } catch (notifError) {
          console.error('[Reply Upvote] ❌ Error sending notification:', notifError);
        }
      }
    }

    res.json({
      success: true,
      message: upvoted ? 'Reply upvoted' : 'Reply upvote removed',
      upvoted,
      upvoteCount: updatedReply.upvotes ? updatedReply.upvotes.length : 0
    });
  } catch (error) {
    console.error('Reply upvote error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/:id/convert-to-room
// @desc    Convert post to collaboration room
// @access  Private
router.post('/:id/convert-to-room', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check ownership
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the post author can convert to room'
      });
    }

    // Check if room already exists
    if (post.roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room already exists for this post'
      });
    }

    // Create room
    const room = await Room.create({
      name: post.title,
      description: post.description,
      postId: post._id,
      creator: req.user._id,
      participants: [
        { user: req.user._id, role: 'Creator' },
        ...post.collaborators.map(collab => ({
          user: collab.user,
          role: 'Helper'
        }))
      ]
    });

    // Update post with room ID and status
    post.roomId = room._id;
    post.status = 'In Progress';
    await post.save();

    // Create conversation for room
    try {
      const { ensureRoomConversation } = require('../utils/roomConversation');
      const conversation = await ensureRoomConversation(room._id);
      console.log('[Convert to Room] Created conversation for room:', {
        roomId: room._id,
        conversationId: conversation._id
      });
    } catch (convError) {
      console.error('[Convert to Room] Failed to create conversation for room:', convError);
      // Don't fail the request if conversation creation fails
    }

    res.json({
      success: true,
      message: 'Room created successfully',
      room
    });
  } catch (error) {
    console.error('Convert to room error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ==================== BIN/TRASH ROUTES ====================

// @route   GET /api/posts/bin/user
// @desc    Get user's deleted posts (bin)
// @access  Private
router.get('/bin/user', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await Post.findDeleted({ author: req.user._id })
      .populate('author', 'name profilePicture rating')
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Post.countDocuments({ author: req.user._id, isDeleted: true });

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
    console.error('Get bin posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/posts/bin/:id
// @desc    Get single deleted post details
// @access  Private
router.get('/bin/:id', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id, 
      isDeleted: true,
      author: req.user._id 
    })
      .populate('author', 'name profilePicture rating completedCollaborations skills')
      .populate('collaborators.user', 'name profilePicture')
      .populate('comments.author', 'name profilePicture')
      .populate('comments.replies.author', 'name profilePicture');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Deleted post not found'
      });
    }

    res.json({
      success: true,
      post
    });
  } catch (error) {
    console.error('Get deleted post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/posts/bin/:id/restore
// @desc    Restore deleted post
// @access  Private
router.post('/bin/:id/restore', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id, 
      isDeleted: true,
      author: req.user._id 
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Deleted post not found'
      });
    }

    // Restore the post
    await post.restore();

    res.json({
      success: true,
      message: 'Post restored successfully',
      post
    });
  } catch (error) {
    console.error('Restore post error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/posts/bin/:id/permanent
// @desc    Permanently delete post from bin
// @access  Private
router.delete('/bin/:id/permanent', authenticateToken, async (req, res) => {
  try {
    const post = await Post.findOne({ 
      _id: req.params.id, 
      isDeleted: true,
      author: req.user._id 
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Deleted post not found'
      });
    }

    // Permanently delete the post
    await Post.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Post permanently deleted'
    });
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/posts/bin/bulk-permanent
// @desc    Permanently delete multiple posts from bin
// @access  Private
router.delete('/bin/bulk-permanent', authenticateToken, async (req, res) => {
  try {
    const { postIds } = req.body;
    
    if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Post IDs array is required'
      });
    }

    // Verify all posts belong to the user and are deleted
    const posts = await Post.find({ 
      _id: { $in: postIds },
      isDeleted: true,
      author: req.user._id 
    });

    if (posts.length !== postIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some posts not found or not accessible'
      });
    }

    // Permanently delete all posts
    await Post.deleteMany({ 
      _id: { $in: postIds },
      isDeleted: true,
      author: req.user._id 
    });

    res.json({
      success: true,
      message: `${postIds.length} posts permanently deleted`
    });
  } catch (error) {
    console.error('Bulk permanent delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
