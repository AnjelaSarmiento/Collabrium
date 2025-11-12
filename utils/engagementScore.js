/**
 * Engagement Score Calculator
 * Calculates how engaged a user is with another user based on:
 * - Interaction frequency (likes, comments, messages)
 * - Recent engagement
 * - Profile visits
 * 
 * Returns a score (0-100) indicating engagement level
 */

const User = require('../models/User');
const Post = require('../models/Post');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

/**
 * Calculate engagement score between two users
 * @param {String} userId - The user viewing/interacting
 * @param {String} connectionId - The connection being scored
 * @returns {Promise<Object>} - { score: number, reasons: string[], weeklyInteractions: number }
 */
async function calculateEngagementScore(userId, connectionId) {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let score = 0;
    const reasons = [];
    let weeklyInteractions = 0;

    // 1. Count likes/upvotes on connection's posts (past month)
    const connectionPosts = await Post.find({
      author: connectionId,
      createdAt: { $gte: oneMonthAgo }
    }).select('_id upvotes');

    let likesOnConnectionPosts = 0;
    let recentLikes = 0;
    connectionPosts.forEach(post => {
      const userUpvote = post.upvotes?.find(
        upvote => upvote.user?.toString() === userId.toString()
      );
      if (userUpvote) {
        likesOnConnectionPosts++;
        if (userUpvote.createdAt && new Date(userUpvote.createdAt) >= oneWeekAgo) {
          recentLikes++;
        }
      }
    });

    if (likesOnConnectionPosts > 0) {
      score += Math.min(likesOnConnectionPosts * 8, 25); // Reduced: 8 points each, max 25 (was 10/30)
      reasons.push(`${likesOnConnectionPosts} like(s) on their posts`);
      weeklyInteractions += recentLikes;
    }

    // 2. Count comments on connection's posts (past month)
    const postsWithComments = await Post.find({
      author: connectionId,
      'comments.author': userId,
      'comments.createdAt': { $gte: oneMonthAgo }
    }).select('comments');

    let commentCount = 0;
    let recentComments = 0;
    postsWithComments.forEach(post => {
      post.comments.forEach(comment => {
        if (comment.author?.toString() === userId.toString()) {
          commentCount++;
          if (comment.createdAt && new Date(comment.createdAt) >= oneWeekAgo) {
            recentComments++;
          }
        }
      });
    });

    if (commentCount > 0) {
      score += Math.min(commentCount * 12, 30); // Reduced: 12 points each, max 30 (was 15/35)
      reasons.push(`${commentCount} comment(s) on their posts`);
      weeklyInteractions += recentComments;
    }

    // 3. Count messages exchanged (past month)
    const conversations = await Conversation.find({
      participants: { $all: [userId, connectionId] }
    }).select('_id');

    let messageCount = 0;
    let recentMessages = 0;
    if (conversations.length > 0) {
      const conversationIds = conversations.map(c => c._id);
      const messages = await Message.find({
        conversation: { $in: conversationIds },
        sender: userId,
        createdAt: { $gte: oneMonthAgo }
      }).select('createdAt');

      messageCount = messages.length;
      recentMessages = messages.filter(
        msg => msg.createdAt >= oneWeekAgo
      ).length;
    }

    if (messageCount > 0) {
      score += Math.min(messageCount * 3, 20); // Reduced: 3 points each, max 20 (was 5/25)
      reasons.push(`${messageCount} message(s) sent`);
      weeklyInteractions += recentMessages;
    }

    // 4. Recency bonus (interactions in last week get higher weight) - Stricter requirements
    const recentInteractionCount = recentLikes + recentComments + recentMessages;
    if (recentInteractionCount >= 5) {
      score += 15; // Reduced bonus, requires 5+ interactions (was 3+ for 20 points)
      reasons.push('Very high recent engagement (5+ this week)');
    } else if (recentInteractionCount >= 3) {
      score += 10; // Reduced: requires 3+ interactions for moderate bonus (was 1+)
      reasons.push('High recent engagement (3+ this week)');
    } else if (recentInteractionCount >= 1) {
      score += 5; // Small bonus for minimal engagement
      reasons.push('Some recent engagement');
    }

    // 5. Penalty for no recent interaction (no interaction in 2+ weeks)
    const totalRecentInteractions = recentLikes + recentComments + recentMessages;
    if (totalRecentInteractions === 0 && score > 0) {
      // Had interactions before but not recently
      const lastInteraction = await findLastInteraction(userId, connectionId);
      if (lastInteraction) {
        const daysSince = (now - lastInteraction) / (1000 * 60 * 60 * 24);
        if (daysSince > 14) {
          score *= 0.3; // Reduce score by 70% if no interaction for 2+ weeks
          reasons.push('No interaction for 2+ weeks (reduced visibility)');
        }
      }
    }

    // Normalize score to 0-100
    score = Math.min(Math.round(score), 100);

    return {
      score,
      reasons,
      weeklyInteractions,
      totalInteractions: likesOnConnectionPosts + commentCount + messageCount
    };
  } catch (error) {
    console.error('[EngagementScore] Error calculating score:', error);
    return {
      score: 0,
      reasons: [],
      weeklyInteractions: 0,
      totalInteractions: 0
    };
  }
}

/**
 * Find the last interaction date between two users
 */
async function findLastInteraction(userId, connectionId) {
  try {
    let lastDate = null;

    // Check last like
    const lastLikePost = await Post.findOne({
      author: connectionId,
      'upvotes.user': userId
    }).sort({ 'upvotes.createdAt': -1 }).select('upvotes');

    if (lastLikePost?.upvotes?.length > 0) {
      const userUpvote = lastLikePost.upvotes.find(
        u => u.user?.toString() === userId.toString()
      );
      if (userUpvote?.createdAt) {
        lastDate = new Date(userUpvote.createdAt);
      }
    }

    // Check last comment
    const lastCommentPost = await Post.findOne({
      author: connectionId,
      'comments.author': userId
    }).sort({ 'comments.createdAt': -1 }).select('comments');

    if (lastCommentPost?.comments?.length > 0) {
      const userComment = lastCommentPost.comments.find(
        c => c.author?.toString() === userId.toString()
      );
      if (userComment?.createdAt) {
        const commentDate = new Date(userComment.createdAt);
        if (!lastDate || commentDate > lastDate) {
          lastDate = commentDate;
        }
      }
    }

    // Check last message
    const conversations = await Conversation.find({
      participants: { $all: [userId, connectionId] }
    }).select('_id');

    if (conversations.length > 0) {
      const lastMessage = await Message.findOne({
        conversation: { $in: conversations.map(c => c._id) },
        sender: userId
      }).sort({ createdAt: -1 }).select('createdAt');

      if (lastMessage?.createdAt) {
        const messageDate = new Date(lastMessage.createdAt);
        if (!lastDate || messageDate > lastDate) {
          lastDate = messageDate;
        }
      }
    }

    return lastDate;
  } catch (error) {
    console.error('[EngagementScore] Error finding last interaction:', error);
    return null;
  }
}

/**
 * Get prioritized connections for notifications
 * Returns connections that should be notified when a user posts
 * @param {String} userId - The user who posted
 * @param {Number} minScore - Minimum engagement score (default: 40)
 * @returns {Promise<Array>} - Array of { userId, score, reasons }
 */
async function getPrioritizedConnections(userId, minScore = 40) {
  try {
    const user = await User.findById(userId).select('connections');
    if (!user || !user.connections || user.connections.length === 0) {
      return [];
    }

    // Calculate engagement from the connection's perspective (how engaged they are with the poster)
    // When user A posts, we want to know: how engaged is user B (connection) with user A?
    const connectionScores = await Promise.all(
      user.connections.map(async (connectionId) => {
        // Calculate: How engaged is this connection with the poster?
        // connectionId = viewer/interactor, userId = poster
        const engagement = await calculateEngagementScore(connectionId.toString(), userId.toString());
        return {
          userId: connectionId.toString(),
          score: engagement.score,
          weeklyInteractions: engagement.weeklyInteractions,
          reasons: engagement.reasons
        };
      })
    );

    // Filter and sort by score
    return connectionScores
      .filter(conn => conn.score >= minScore)
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('[EngagementScore] Error getting prioritized connections:', error);
    return [];
  }
}

/**
 * Check if user is mentioned/tagged in post
 * @param {String} postContent - Post title + description
 * @param {String} userId - User ID to check
 * @returns {Promise<Boolean>}
 */
async function isUserMentioned(postContent, userId) {
  try {
    const user = await User.findById(userId).select('name');
    if (!user || !user.name) return false;

    // Simple mention detection (can be enhanced with @mentions later)
    const mentionPattern = new RegExp(`@${user.name}|${user.name}`, 'i');
    return mentionPattern.test(postContent);
  } catch (error) {
    console.error('[EngagementScore] Error checking mention:', error);
    return false;
  }
}

module.exports = {
  calculateEngagementScore,
  getPrioritizedConnections,
  isUserMentioned,
  findLastInteraction
};

