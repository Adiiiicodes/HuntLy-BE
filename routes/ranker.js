// routes/ranker.js
const express = require('express');
const router = express.Router();
const { enhanceResponse } = require('../utils/response-enhancer');

/**
 * @route POST /api/ranker
 * @desc Process candidate data into structured JSON format using POST
 * @access Public
 */
router.post('/', async (req, res) => {
    try {
        console.log('POST request received to /api/ranker');
        const { initialResponse, query } = req.body;

        // Validate required parameters
        if (!initialResponse) {
            console.log('Missing initialResponse parameter');
            return res.status(400).json({
                success: false,
                error: 'initialResponse parameter is required'
            });
        }

        if (!query) {
            console.log('Missing query parameter');
            return res.status(400).json({
                success: false,
                error: 'query parameter is required'
            });
        }

        console.log('Processing request with query:', query);
        console.log('Initial response length:', initialResponse.length);

        // Process the response
        const result = await enhanceResponse(initialResponse, query);
        
        // Verify result structure before sending
        if (!result.data || !Array.isArray(result.data)) {
            console.log('Result data is not an array:', result);
            return res.status(500).json({
                success: false,
                error: 'Invalid result structure'
            });
        }
        
        // Ensure all candidates have a rank property
        result.data = result.data.map((candidate, index) => {
            if (!candidate.hasOwnProperty('rank')) {
                console.log(`Adding missing rank to candidate ${index}`);
                return { ...candidate, rank: String(index + 1) };
            }
            return candidate;
        });
        
        console.log(`Returning ${result.data.length} candidates`);
        
        // Return the processed result
        res.json(result);

    } catch (error) {
        console.error('Enhance Response Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enhance response',
            details: error.message
        });
    }
});

/**
 * @route GET /api/ranker/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'candidate-ranker',
        timestamp: new Date().toISOString() 
    });
});

// For backward compatibility - redirect GET requests to use POST
router.get('/', (req, res) => {
    res.status(405).json({
        success: false,
        error: 'GET method is deprecated, please use POST'
    });
});

// Export the router
module.exports = router;