const express = require('express');
const router = express.Router();
const { enhanceResponse } = require('../utils/response-enhancer');

/**
 * @route GET /api/enhance
 * @desc Enhance a response using Groq API
 * @access Public
 */
router.get('/', async (req, res) => {
    try {
        const { response } = req.query;

        if (!response) {
            return res.status(400).json({
                success: false,
                error: 'Response parameter is required'
            });
        }

        const enhancedResponse = await enhanceResponse(response);

        res.json({
            success: true,
            data: {
                originalResponse: response,
                enhancedResponse: enhancedResponse
            }
        });

    } catch (error) {
        console.error('Enhance Response Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enhance response',
            details: error.message
        });
    }
});

module.exports = router; 