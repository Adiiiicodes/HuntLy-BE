const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { createToken, JWT_EXPIRES_IN } = require('../utils/jwt');
const { protect } = require('../middleware/auth');

// Convert JWT_EXPIRES_IN string to milliseconds for cookie
const getExpiryMs = (expiresIn) => {
  const unit = expiresIn.slice(-1);
  const value = parseInt(expiresIn.slice(0, -1));
  
  switch(unit) {
    case 'd': return value * 24 * 60 * 60 * 1000; // days
    case 'h': return value * 60 * 60 * 1000; // hours
    case 'm': return value * 60 * 1000; // minutes
    case 's': return value * 1000; // seconds
    default: return 2 * 24 * 60 * 60 * 1000; // default 2 days
  }
};

// Helper function to set auth cookie
const setTokenCookie = (res, user) => {
  // Create token payload
  const tokenPayload = {
    id: user._id,
    name: user.name,
    email: user.email
  };
  
  // Generate JWT token
  const token = createToken(tokenPayload);
  
  // Set cookie options
  const cookieOptions = {
    expires: new Date(Date.now() + getExpiryMs(JWT_EXPIRES_IN)),
    httpOnly: true, // Cannot be accessed by client-side JavaScript
    secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
    sameSite: 'strict' // Protect against CSRF
  };
  
  // Set the cookie
  res.cookie('token', token, cookieOptions);
  
  return token;
};

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Create new user
    const user = await User.create({
      name,
      email,
      password
    });
    
    // Set JWT token cookie
    const token = setTokenCookie(res, user);
    
    // Return user data (without password)
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        savedProfiles: user.savedProfiles
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Log in a user
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }
    
    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    
    // Check if user exists
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if password is correct
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Set JWT token cookie
    const token = setTokenCookie(res, user);
    
    // Return user data (without password)
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        savedProfiles: user.savedProfiles
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/auth/logout
 * @desc    Log out a user by clearing cookie
 * @access  Private
 */
router.get('/logout', protect, (req, res) => {
  // Clear the cookie
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000), // Expire in 5 seconds
    httpOnly: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
  try {
    // User is already attached to req by the protect middleware
    const user = await User.findById(req.user._id).populate('savedProfiles');
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        savedProfiles: user.savedProfiles
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user data'
    });
  }
});

/**
 * @route   POST /api/auth/save-profile
 * @desc    Save a profile to user's saved profiles
 * @access  Private
 */
router.post('/save-profile', protect, async (req, res) => {
  try {
    const { profileId } = req.body;
    
    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'Profile ID is required'
      });
    }
    
    // Check if profile is already saved
    const user = await User.findById(req.user._id);
    
    if (user.savedProfiles.includes(profileId)) {
      return res.status(400).json({
        success: false,
        message: 'Profile already saved'
      });
    }
    
    // Add profile to saved profiles
    user.savedProfiles.push(profileId);
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Profile saved successfully',
      savedProfiles: user.savedProfiles
    });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving profile'
    });
  }
});

/**
 * @route   DELETE /api/auth/remove-profile/:profileId
 * @desc    Remove a profile from user's saved profiles
 * @access  Private
 */
router.delete('/remove-profile/:profileId', protect, async (req, res) => {
  try {
    const { profileId } = req.params;
    
    // Remove profile from saved profiles
    const user = await User.findById(req.user._id);
    
    // Check if profile exists in saved profiles
    if (!user.savedProfiles.includes(profileId)) {
      return res.status(400).json({
        success: false,
        message: 'Profile not found in saved profiles'
      });
    }
    
    // Remove profile
    user.savedProfiles = user.savedProfiles.filter(
      profile => profile.toString() !== profileId
    );
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Profile removed successfully',
      savedProfiles: user.savedProfiles
    });
  } catch (error) {
    console.error('Remove profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing profile'
    });
  }
});

module.exports = router;