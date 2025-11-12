const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 100, // Starting balance
    min: [0, 'Balance cannot be negative']
  },
  totalEarned: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  transactions: [{
    type: {
      type: String,
      enum: ['Earn', 'Spend', 'Transfer', 'Purchase', 'Refund', 'Tip'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount must be positive']
    },
    description: {
      type: String,
      required: true,
      maxlength: [200, 'Description cannot exceed 200 characters']
    },
    relatedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    relatedPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post'
    },
    relatedRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room'
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed', 'Cancelled'],
      default: 'Completed'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  escrow: [{
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post'
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['Held', 'Released', 'Refunded'],
      default: 'Held'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    releasedAt: Date,
    releasedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  paymentMethods: [{
    type: {
      type: String,
      enum: ['PayPal', 'GCash', 'Bank Transfer'],
      required: true
    },
    accountId: {
      type: String,
      required: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    autoAcceptPayments: {
      type: Boolean,
      default: true
    },
    minimumWithdrawal: {
      type: Number,
      default: 50
    },
    currency: {
      type: String,
      default: 'CollabPoints',
      enum: ['CollabPoints', 'USD', 'PHP']
    }
  }
}, {
  timestamps: true
});

// Index for better performance
walletSchema.index({ user: 1 });
walletSchema.index({ 'transactions.createdAt': -1 });
walletSchema.index({ 'escrow.status': 1 });

// Method to add transaction
walletSchema.methods.addTransaction = function(type, amount, description, relatedUser = null, relatedPost = null, relatedRoom = null, metadata = {}) {
  this.transactions.push({
    type,
    amount,
    description,
    relatedUser,
    relatedPost,
    relatedRoom,
    metadata
  });

  // Update balance based on transaction type
  if (type === 'Earn' || type === 'Purchase' || type === 'Refund') {
    this.balance += amount;
    if (type === 'Earn') this.totalEarned += amount;
  } else if (type === 'Spend' || type === 'Transfer' || type === 'Tip') {
    this.balance -= amount;
    if (type === 'Spend') this.totalSpent += amount;
  }
};

// Method to hold funds in escrow
walletSchema.methods.holdEscrow = function(postId, amount) {
  this.escrow.push({
    postId,
    amount,
    status: 'Held'
  });
  this.balance -= amount;
};

// Method to release escrow
walletSchema.methods.releaseEscrow = function(postId, releasedTo) {
  const escrowItem = this.escrow.find(item => 
    item.postId.toString() === postId.toString() && item.status === 'Held'
  );
  
  if (escrowItem) {
    escrowItem.status = 'Released';
    escrowItem.releasedAt = new Date();
    escrowItem.releasedTo = releasedTo;
    return escrowItem.amount;
  }
  return 0;
};

// Method to refund escrow
walletSchema.methods.refundEscrow = function(postId) {
  const escrowItem = this.escrow.find(item => 
    item.postId.toString() === postId.toString() && item.status === 'Held'
  );
  
  if (escrowItem) {
    escrowItem.status = 'Refunded';
    this.balance += escrowItem.amount;
    return escrowItem.amount;
  }
  return 0;
};

// Method to check if user has sufficient balance
walletSchema.methods.hasSufficientBalance = function(amount) {
  return this.balance >= amount;
};

// Method to get transaction history
walletSchema.methods.getTransactionHistory = function(limit = 50, offset = 0) {
  return this.transactions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(offset, offset + limit);
};

// Method to get escrow summary
walletSchema.methods.getEscrowSummary = function() {
  const held = this.escrow.filter(item => item.status === 'Held');
  const totalHeld = held.reduce((sum, item) => sum + item.amount, 0);
  
  return {
    totalHeld,
    itemsCount: held.length,
    items: held
  };
};

module.exports = mongoose.model('Wallet', walletSchema);
