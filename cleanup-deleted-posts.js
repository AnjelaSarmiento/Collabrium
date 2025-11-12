const mongoose = require('mongoose');
const Post = require('./models/Post');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collabrium', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function cleanupDeletedPosts() {
  try {
    console.log('Starting cleanup of deleted posts...');
    
    // Find posts that were deleted more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const postsToDelete = await Post.find({
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    });
    
    if (postsToDelete.length === 0) {
      console.log('No posts found for cleanup.');
      return;
    }
    
    console.log(`Found ${postsToDelete.length} posts to permanently delete.`);
    
    // Get post IDs for deletion
    const postIds = postsToDelete.map(post => post._id);
    
    // Permanently delete the posts
    const result = await Post.deleteMany({
      _id: { $in: postIds },
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo }
    });
    
    console.log(`Successfully deleted ${result.deletedCount} posts permanently.`);
    
    // Log details of deleted posts
    postsToDelete.forEach(post => {
      console.log(`Deleted: "${post.title}" (deleted on ${post.deletedAt})`);
    });
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupDeletedPosts();
}

module.exports = cleanupDeletedPosts;
