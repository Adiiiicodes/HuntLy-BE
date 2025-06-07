// routes/profile-save.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const mongoose = require('mongoose');

// Get the CandidateData model
let CandidateData;
try {
  CandidateData = mongoose.model('CandidateData');
} catch (error) {
  // Define the schema if it doesn't exist
  const candidateSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true
    },
    email: {
      type: String
    },
    phone: {
      type: String
    },
    resume_text: {
      type: String
    },
    original_text: {
      type: String
    },
    filename: {
      type: String
    },
    upload_date: {
      type: Date,
      default: Date.now
    }
  }, { timestamps: true });
  
  // Create the model
  CandidateData = mongoose.model('CandidateData', candidateSchema);
}

/**
 * @route   POST /api/profiles/save/:candidateId
 * @desc    Save a candidate profile to user's saved profiles
 * @access  Protected
 */
router.post('/save/:candidateId', protect, async (req, res) => {


    // At the beginning of the route handler, add this:
try {
    // Log all collections in the database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Check if our target collection exists
    const candidateCollection = collections.find(c => 
      c.name === 'candidatedatas' || 
      c.name === 'candidate_data' || 
      c.name === 'candidatedata'
    );
    
    console.log('Found candidate collection:', candidateCollection ? candidateCollection.name : 'Not found');
  } catch (dbError) {
    console.error('Error checking collections:', dbError);
  }

    try {
      let { candidateId } = req.params;
      
      console.log('==== PROFILE SAVE DIAGNOSTIC ====');
      console.log('1. Received candidateId:', candidateId);
      console.log('2. User ID:', req.user._id);
      
      if (!candidateId) {
        console.log('3. Error: No candidateId provided');
        return res.status(400).json({
          success: false,
          message: 'Candidate ID is required'
        });
      }
      
      // Clean up the ID (remove any quotes, etc.)
      candidateId = candidateId.trim();
      if (candidateId.startsWith('"') && candidateId.endsWith('"')) {
        candidateId = candidateId.slice(1, -1);
      }
      console.log('4. Cleaned candidateId:', candidateId);
      
      // Check if the ID is a valid MongoDB ObjectId
      const isValidObjectId = mongoose.Types.ObjectId.isValid(candidateId);
      console.log('5. Is valid ObjectId:', isValidObjectId);
      
      if (!isValidObjectId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid candidate ID format'
        });
      }
      
      // Create ObjectId from string
      const objectId = new mongoose.Types.ObjectId(candidateId);
      console.log('6. Created ObjectId:', objectId);
      
      // Get the CandidateData model
      let CandidateData;
      try {
        CandidateData = mongoose.model('CandidateData');
        console.log('7. Successfully retrieved CandidateData model');
      } catch (modelError) {
        console.log('7. Error getting model, creating it now:', modelError.message);
        // If model doesn't exist yet, define it
        const candidateSchema = new mongoose.Schema({
          name: String,
          email: String,
          phone: String,
          resume_text: String,
          original_text: String,
          filename: String,
          upload_date: {
            type: Date,
            default: Date.now
          }
        }, { timestamps: true });
        
        CandidateData = mongoose.model('candidatedatas', candidateSchema);
        console.log('7a. Created new CandidateData model');
      }
      
      // Check if candidate exists in MongoDB
      console.log('8. Attempting to find candidate with ID:', objectId);
      const candidate = await CandidateData.findById(objectId);
      console.log('9. Candidate found:', candidate ? 'Yes' : 'No');
      
      if (!candidate) {
        // Let's try to find ANY document in the collection to see if it's working
        const anyCandidate = await CandidateData.findOne({});
        console.log('9a. Any candidate found:', anyCandidate ? 'Yes' : 'No');
        if (anyCandidate) {
          console.log('9b. Sample candidate ID:', anyCandidate._id);
        }
        
        return res.status(404).json({
          success: false,
          message: 'Candidate not found'
        });
      }
      
      // Check if profile is already saved
      const user = await User.findById(req.user._id);
      console.log('10. User found:', user ? 'Yes' : 'No');
      
      // Convert all saved profile IDs to strings for comparison
      const savedProfileIds = user.savedProfiles.map(id => id.toString());
      console.log('11. User saved profiles:', savedProfileIds);
      
      if (savedProfileIds.includes(candidateId)) {
        console.log('12. Profile already saved');
        return res.status(400).json({
          success: false,
          message: 'Profile already saved'
        });
      }
      
      // Add profile to saved profiles
      user.savedProfiles.push(objectId);
      console.log('13. Added profile to saved profiles');
      await user.save();
      console.log('14. User saved successfully');
      
      res.status(200).json({
        success: true,
        message: 'Profile saved successfully',
        savedProfiles: user.savedProfiles.map(id => id.toString())
      });
    } catch (error) {
      console.error('ERROR in profile save:', error);
      return res.status(500).json({
        success: false,
        message: 'Error saving profile',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

/**
 * @route   DELETE /api/profiles/remove/:candidateId
 * @desc    Remove a candidate profile from user's saved profiles
 * @access  Protected
 */
router.delete('/remove/:candidateId', protect, async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    // Remove profile from saved profiles
    const user = await User.findById(req.user._id);
    
    // Check if profile exists in saved profiles
    if (!user.savedProfiles.includes(candidateId)) {
      return res.status(400).json({
        success: false,
        message: 'Profile not found in saved profiles'
      });
    }
    
    // Remove profile
    user.savedProfiles = user.savedProfiles.filter(
      profile => profile.toString() !== candidateId.toString()
    );
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Profile removed successfully',
      savedProfiles: user.savedProfiles
    });
  } catch (error) {
    console.error(`Error removing profile: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error removing profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/profiles/saved
 * @desc    Get all saved candidate profiles for the user
 * @access  Protected
 */
router.get('/saved', protect, async (req, res) => {
  try {
    // Get user's saved profiles
    const user = await User.findById(req.user._id);
    const savedProfileIds = user.savedProfiles;
    
    if (savedProfileIds.length === 0) {
      return res.status(200).json({
        success: true,
        savedProfiles: []
      });
    }
    
    // Fetch the actual candidate data for the saved profiles from MongoDB
    const savedProfiles = await CandidateData.find({
      _id: { $in: savedProfileIds }
    }).select('name email phone resume_text upload_date');
    
    res.status(200).json({
      success: true,
      savedProfiles
    });
  } catch (error) {
    console.error(`Error fetching saved profiles: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error fetching saved profiles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;