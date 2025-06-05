const express = require('express');
const router = express.Router();
const { formatCandidates } = require('../utils/candidate-formatter');

// Base route handler
router.get('/', (req, res) => {
    res.json({
        message: 'Candidate search API is working',
        endpoints: {
            search: '/api/candidates/search - POST request with query and initialResponse in body'
        }
    });
});

// Search endpoint - POST only
router.post('/search', async (req, res) => {
    try {
        const { query, initialResponse } = req.body;

        if (!query || !initialResponse) {
            return res.status(400).json({
                success: false,
                message: 'Both query and initialResponse are required in the request body'
            });
        }

        console.log('Received search request:');
        console.log('- Query:', query);
        console.log('- Initial response length:', initialResponse.length);

        // Format the existing response into structured JSON
        const formattedCandidates = await formatCandidates(initialResponse, query);

        console.log(`Returning ${formattedCandidates.length} formatted candidates`);

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

// Redirect GET requests to the documentation
router.get('/search', (req, res) => {
    res.status(405).json({
        success: false,
        message: 'Method Not Allowed. Please use POST for search requests',
        correctUsage: {
            method: 'POST',
            endpoint: '/api/candidates/search',
            body: {
                query: 'Your search query',
                initialResponse: 'JSON response from initial search'
            }
        }
    });
});

module.exports = router;