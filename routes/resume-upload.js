const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { upload, processResume, processMultipleResumes, cleanupFiles } = require('../middleware/resumeProcessor');
const { protect } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

/**
 * @route   POST /api/resumes/upload
 * @desc    Upload a single resume
 * @access  Protected
 */
router.post('/upload', protect, upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No resume file uploaded'
    });
  }

  try {
    const result = await processResume(req.file.path);
    // Clean up the uploaded file
    cleanupFiles([req.file.path]);

    return res.status(200).json({
      success: true,
      message: 'Resume uploaded and processed successfully',
      filename: req.file.originalname,
      candidateId: result.candidateId
    });
  } catch (error) {
    // Clean up the uploaded file
    if (req.file && req.file.path) {
      cleanupFiles([req.file.path]);
    }
    console.error(`Error processing resume: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error processing resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/resumes/upload/bulk
 * @desc    Upload multiple resumes
 * @access  Protected
 */
router.post('/upload/bulk', protect, upload.array('resumes', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No resume files uploaded'
    });
  }

  try {
    const filePaths = req.files.map(file => file.path);
    const results = await processMultipleResumes(filePaths);
    // Clean up the uploaded files
    cleanupFiles(filePaths);

    // Count successful and failed uploads
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: true,
      message: `Processed ${successful} resumes successfully, ${failed} failed`,
      totalProcessed: req.files.length,
      successful,
      failed,
      results: results.map(r => ({
        filename: r.filePath ? path.basename(r.filePath) : 'unknown',
        success: r.success,
        candidateId: r.candidateId || null,
        error: r.error
      }))
    });
  } catch (error) {
    // Clean up the uploaded files
    if (req.files && req.files.length > 0) {
      cleanupFiles(req.files.map(file => file.path));
    }
    console.error(`Error processing resumes: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Error processing resumes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/resumes/candidates
 * @desc    Get all candidates
 * @access  Protected
 */
router.get('/candidates', protect, async (req, res) => {
    try {
      // Get the CandidateData model
      let CandidateData;
      try {
        CandidateData = mongoose.model('CandidateData');
      } catch (error) {
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
        
        CandidateData = mongoose.model('CandidateData', candidateSchema);
      }
      
      // Fetch all candidates from MongoDB
      const candidates = await CandidateData.find()
        .select('name email phone resume_text upload_date')
        .sort({ upload_date: -1 });
      
      return res.status(200).json({
        success: true,
        candidates
      });
    } catch (error) {
      console.error(`Error fetching candidates: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Error fetching candidates',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

module.exports = router;
