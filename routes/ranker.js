// routes/ranker.js
const express = require('express');
const router = express.Router();
const { enhanceResponse } = require('../utils/response-enhancer');

/**
 * @route GET /api/ranker
 * @desc Process candidate data into structured JSON format
 * @access Public
 */
router.get('/', async (req, res) => {
    try {
        const { initialResponse, query } = req.query;

        if (!initialResponse) {
            return res.status(400).json({
                success: false,
                error: 'initialResponse parameter is required'
            });
        }

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query parameter is required'
            });
        }

        // Process the response
        const result = await enhanceResponse(initialResponse, query);
        
        // Return the processed result directly
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
 * @route POST /api/ranker
 * @desc Process candidate data into structured JSON format (POST version)
 * @access Public
 */
router.post('/', async (req, res) => {
    try {
        const { initialResponse, query } = req.body;

        if (!initialResponse) {
            return res.status(400).json({
                success: false,
                error: 'initialResponse parameter is required'
            });
        }

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query parameter is required'
            });
        }

        // Process the response
        const result = await enhanceResponse(initialResponse, query);
        
        // Return the processed result directly
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

// Export the router
module.exports = router;