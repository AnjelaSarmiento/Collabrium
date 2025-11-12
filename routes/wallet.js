const express = require('express');
const { body, validationResult } = require('express-validator');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/wallet
// @desc    Get user wallet
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = await Wallet.create({
        user: req.user._id,
        balance: 100 // Starting balance
      });
    }

    res.json({
      success: true,
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
        totalSpent: wallet.totalSpent,
        escrowSummary: wallet.getEscrowSummary()
      }
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/wallet/transactions
// @desc    Get wallet transaction history
// @access  Private
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, page = 1, type } = req.query;
    const skip = (page - 1) * limit;

    const wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    let transactions = wallet.transactions;

    // Filter by type if provided
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    // Sort by date (newest first)
    transactions.sort((a, b) => b.createdAt - a.createdAt);

    // Paginate
    const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

    // Populate related data
    const populatedTransactions = await Promise.all(
      paginatedTransactions.map(async (transaction) => {
        const populated = { ...transaction.toObject() };
        
        if (transaction.relatedUser) {
          const user = await User.findById(transaction.relatedUser).select('name profilePicture');
          populated.relatedUser = user;
        }
        
        return populated;
      })
    );

    res.json({
      success: true,
      transactions: populatedTransactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(transactions.length / limit),
        total: transactions.length
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

// @route   POST /api/wallet/transfer
// @desc    Transfer CollabPoints to another user
// @access  Private
router.post('/transfer', authenticateToken, [
  body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
  body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
  body('description').optional().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters')
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

    const { recipientId, amount, description = 'Transfer' } = req.body;

    // Check if transferring to self
    if (recipientId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot transfer to yourself'
      });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Get sender wallet
    const senderWallet = await Wallet.findOne({ user: req.user._id });
    if (!senderWallet) {
      return res.status(404).json({
        success: false,
        message: 'Sender wallet not found'
      });
    }

    // Check sufficient balance
    if (!senderWallet.hasSufficientBalance(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Get or create recipient wallet
    let recipientWallet = await Wallet.findOne({ user: recipientId });
    if (!recipientWallet) {
      recipientWallet = await Wallet.create({
        user: recipientId,
        balance: 100
      });
    }

    // Add transaction to sender
    senderWallet.addTransaction('Transfer', amount, `Transfer to ${recipient.name}`, recipientId, null, null, { description });

    // Add transaction to recipient
    recipientWallet.addTransaction('Earn', amount, `Transfer from ${req.user.name}`, req.user._id, null, null, { description });

    await senderWallet.save();
    await recipientWallet.save();

    res.json({
      success: true,
      message: 'Transfer completed successfully',
      newBalance: senderWallet.balance
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/wallet/tip
// @desc    Tip another user
// @access  Private
router.post('/tip', authenticateToken, [
  body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
  body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
  body('description').optional().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters')
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

    const { recipientId, amount, description = 'Tip' } = req.body;

    // Check if tipping self
    if (recipientId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot tip yourself'
      });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Get sender wallet
    const senderWallet = await Wallet.findOne({ user: req.user._id });
    if (!senderWallet) {
      return res.status(404).json({
        success: false,
        message: 'Sender wallet not found'
      });
    }

    // Check sufficient balance
    if (!senderWallet.hasSufficientBalance(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Get or create recipient wallet
    let recipientWallet = await Wallet.findOne({ user: recipientId });
    if (!recipientWallet) {
      recipientWallet = await Wallet.create({
        user: recipientId,
        balance: 100
      });
    }

    // Add transaction to sender
    senderWallet.addTransaction('Tip', amount, `Tip to ${recipient.name}`, recipientId, null, null, { description });

    // Add transaction to recipient
    recipientWallet.addTransaction('Earn', amount, `Tip from ${req.user.name}`, req.user._id, null, null, { description });

    await senderWallet.save();
    await recipientWallet.save();

    res.json({
      success: true,
      message: 'Tip sent successfully',
      newBalance: senderWallet.balance
    });
  } catch (error) {
    console.error('Tip error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/wallet/purchase
// @desc    Purchase CollabPoints (simulate payment)
// @access  Private
router.post('/purchase', authenticateToken, [
  body('amount').isInt({ min: 10 }).withMessage('Minimum purchase amount is 10 CollabPoints'),
  body('paymentMethod').isIn(['PayPal', 'GCash', 'Bank Transfer']).withMessage('Invalid payment method'),
  body('paymentData').notEmpty().withMessage('Payment data is required')
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

    const { amount, paymentMethod, paymentData } = req.body;

    // Get wallet
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // In a real implementation, you would:
    // 1. Process payment with PayPal/GCash API
    // 2. Verify payment status
    // 3. Add points only after successful payment

    // For demo purposes, we'll simulate successful payment
    const purchaseAmount = amount;
    const bonusAmount = Math.floor(amount * 0.1); // 10% bonus
    const totalAmount = purchaseAmount + bonusAmount;

    // Add transaction
    wallet.addTransaction('Purchase', totalAmount, `Purchase via ${paymentMethod}`, null, null, null, {
      paymentMethod,
      paymentData,
      purchaseAmount,
      bonusAmount
    });

    await wallet.save();

    res.json({
      success: true,
      message: 'CollabPoints purchased successfully',
      newBalance: wallet.balance,
      purchaseDetails: {
        purchased: purchaseAmount,
        bonus: bonusAmount,
        total: totalAmount
      }
    });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/wallet/escrow
// @desc    Get escrow summary
// @access  Private
router.get('/escrow', authenticateToken, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const escrowSummary = wallet.getEscrowSummary();

    // Populate post details
    const Post = require('../models/Post');
    const populatedEscrow = await Promise.all(
      escrowSummary.items.map(async (item) => {
        const post = await Post.findById(item.postId).select('title type reward');
        return {
          ...item.toObject(),
          post
        };
      })
    );

    res.json({
      success: true,
      escrow: {
        totalHeld: escrowSummary.totalHeld,
        itemsCount: escrowSummary.itemsCount,
        items: populatedEscrow
      }
    });
  } catch (error) {
    console.error('Get escrow error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/wallet/withdraw
// @desc    Request withdrawal (simulate)
// @access  Private
router.post('/withdraw', authenticateToken, [
  body('amount').isInt({ min: 50 }).withMessage('Minimum withdrawal amount is 50 CollabPoints'),
  body('paymentMethod').isIn(['PayPal', 'GCash', 'Bank Transfer']).withMessage('Invalid payment method'),
  body('accountDetails').notEmpty().withMessage('Account details are required')
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

    const { amount, paymentMethod, accountDetails } = req.body;

    // Get wallet
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Check minimum withdrawal
    if (amount < wallet.settings.minimumWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ${wallet.settings.minimumWithdrawal} CollabPoints`
      });
    }

    // Check sufficient balance
    if (!wallet.hasSufficientBalance(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // In a real implementation, you would:
    // 1. Process withdrawal with payment provider
    // 2. Create withdrawal request record
    // 3. Handle approval process

    // For demo purposes, we'll simulate immediate withdrawal
    wallet.addTransaction('Spend', amount, `Withdrawal via ${paymentMethod}`, null, null, null, {
      paymentMethod,
      accountDetails,
      status: 'Completed'
    });

    await wallet.save();

    res.json({
      success: true,
      message: 'Withdrawal request processed successfully',
      newBalance: wallet.balance,
      withdrawalDetails: {
        amount,
        paymentMethod,
        status: 'Completed'
      }
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/wallet/settings
// @desc    Update wallet settings
// @access  Private
router.put('/settings', authenticateToken, [
  body('autoAcceptPayments').optional().isBoolean().withMessage('Auto accept payments must be boolean'),
  body('minimumWithdrawal').optional().isInt({ min: 10 }).withMessage('Minimum withdrawal must be at least 10'),
  body('currency').optional().isIn(['CollabPoints', 'USD', 'PHP']).withMessage('Invalid currency')
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

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const { autoAcceptPayments, minimumWithdrawal, currency } = req.body;

    if (autoAcceptPayments !== undefined) {
      wallet.settings.autoAcceptPayments = autoAcceptPayments;
    }
    if (minimumWithdrawal !== undefined) {
      wallet.settings.minimumWithdrawal = minimumWithdrawal;
    }
    if (currency !== undefined) {
      wallet.settings.currency = currency;
    }

    await wallet.save();

    res.json({
      success: true,
      message: 'Wallet settings updated successfully',
      settings: wallet.settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
