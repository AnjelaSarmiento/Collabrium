const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { generateToken, authenticateToken } = require('../middleware/auth');
const passport = require('../config/passport');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('skills').optional()
], async (req, res) => {
  try {
    console.log('Registration request received:', req.body);
    
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, skills = [] } = req.body;
    console.log('Processing registration for:', email);
    
    // Convert skills string to array if needed
    let skillsArray = skills;
    if (typeof skills === 'string') {
      skillsArray = skills.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      skills: skillsArray
    });

    // Create wallet for user
    await Wallet.create({
      user: user._id,
      balance: 100 // Starting balance
    });

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        skills: user.skills,
        collabPoints: user.collabPoints,
        level: user.level,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    console.log('Login request received:', { email: req.body.email, password: req.body.password ? '***' : 'missing' });
    
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    console.log('Processing login for:', email);

    // Check if user exists and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    console.log('Checking password for user:', user.email);
    const isPasswordValid = await user.comparePassword(password);
    console.log('Password valid:', isPasswordValid);
    if (!isPasswordValid) {
      console.log('Password validation failed for:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last active
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        skills: user.skills,
        collabPoints: user.collabPoints,
        level: user.level,
        profilePicture: user.profilePicture,
        availability: user.availability
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  res.clearCookie('token');
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('badges', 'name description icon')
      .select('-password');

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        skills: user.skills,
        collabPoints: user.collabPoints,
        level: user.level,
        profilePicture: user.profilePicture,
        availability: user.availability,
        badges: user.badges,
        completedCollaborations: user.completedCollaborations
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Forgot password
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
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

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate reset token (in a real app, you'd send this via email)
    const resetToken = generateToken(user._id);

    res.json({
      success: true,
      message: 'Password reset instructions sent to your email',
      resetToken // In production, don't send this in response
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/auth/google
// @desc    Google OAuth authentication
// @access  Public
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      // Generate JWT token for the user
      const token = generateToken(req.user._id);

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Redirect to frontend with token
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendURL}/app?auth=success`);
    } catch (error) {
      console.error('Google callback error:', error);
      const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendURL}/login?error=auth_failed`);
    }
  }
);

// @route   POST /api/auth/google/token
// @desc    Verify Google ID token and authenticate user
// @access  Public
router.post('/google/token', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required'
      });
    }

    // For simplicity, we'll use a direct token verification approach
    // In production, you should verify the token with Google's API
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    console.log('Google token verified for:', email);

    // Check if user already exists with this Google ID
    let user = await User.findOne({ googleId });

    if (user) {
      console.log('Existing Google user found:', user.email);
    } else {
      // Check if user exists with the same email (link accounts)
      user = await User.findOne({ email });

      if (user) {
        console.log('Linking existing email account with Google:', user.email);
        user.googleId = googleId;
        user.provider = 'google';
        // Update profile picture if not set or using default
        if (!user.profilePicture || user.profilePicture === 'https://via.placeholder.com/150') {
          user.profilePicture = picture || user.profilePicture;
        }
        await user.save();
      } else {
        // Create new user
        console.log('Creating new Google user:', email);
        user = await User.create({
          googleId,
          name,
          email,
          profilePicture: picture || 'https://via.placeholder.com/150',
          provider: 'google',
          isVerified: true, // Google accounts are already verified
          skills: [] // User can add skills later
        });

        // Create wallet for new user
        await Wallet.create({
          user: user._id,
          balance: 100 // Starting balance
        });

        console.log('New Google user created:', user.email);
      }
    }

    // Update last active
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: 'Google authentication successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        skills: user.skills,
        collabPoints: user.collabPoints,
        level: user.level,
        profilePicture: user.profilePicture,
        availability: user.availability
      }
    });

  } catch (error) {
    console.error('Google token verification error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid Google token'
    });
  }
});

module.exports = router;
