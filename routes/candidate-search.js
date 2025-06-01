const express = require('express');
const router = express.Router();
const { formatCandidates } = require('../utils/candidate-formatter');

// Base route handler
router.get('/', (req, res) => {
    res.json({
        message: 'Candidate search API is working',
        endpoints: {
            search: '/api/candidates/search?query=YOUR_QUERY&response=YOUR_RESPONSE'
        }
    });
});

// Search endpoint
router.get('/search', async (req, res) => {
    try {
        const { query, response } = req.query;

        if (!query || !response) {
            return res.status(400).json({
                success: false,
                message: 'Both query and response parameters are required'
            });
        }

        // Format the existing response into structured JSON
        const formattedCandidates = await formatCandidates(response, query);

        return res.status(200).json({
            success: true,
            data: formattedCandidates
        });

    } catch (error) {
        console.error('Error in candidate search:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router; 