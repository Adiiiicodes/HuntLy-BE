// routes/chat.js
const express = require('express');
const router = express.Router();
const { processChat } = require('../utils/rag-with-redis');

// POST /api/chat endpoint
router.post('/', async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ error: 'No question provided' });
        }

        // Process the chat with Redis caching
        const result = await processChat(question);
        
        // Return the response
        res.json(result);
        
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/chat/health - Health check endpoint
router.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'chat',
        timestamp: new Date().toISOString() 
    });
});

module.exports = router;