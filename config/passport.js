const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const Wallet = require('../models/Wallet');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Google OAuth profile:', profile);

    // Check if user already exists with this Google ID
    let user = await User.findOne({ googleId: profile.id });

    if (user) {
      console.log('Existing Google user found:', user.email);
      return done(null, user);
    }

    // Check if user exists with the same email (link accounts)
    user = await User.findOne({ email: profile.emails[0].value });

    if (user) {
      console.log('Linking existing email account with Google:', user.email);
      user.googleId = profile.id;
      user.provider = 'google';
      // Update profile picture if not set or using default
      if (!user.profilePicture || user.profilePicture === 'https://via.placeholder.com/150') {
        user.profilePicture = profile.photos[0]?.value || user.profilePicture;
      }
      await user.save();
      return done(null, user);
    }

    // Create new user
    console.log('Creating new Google user:', profile.emails[0].value);
    const newUser = await User.create({
      googleId: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      profilePicture: profile.photos[0]?.value || 'https://via.placeholder.com/150',
      provider: 'google',
      isVerified: true, // Google accounts are already verified
      skills: [] // User can add skills later
    });

    // Create wallet for new user
    await Wallet.create({
      user: newUser._id,
      balance: 100 // Starting balance
    });

    console.log('New Google user created:', newUser.email);
    return done(null, newUser);

  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

module.exports = passport;
