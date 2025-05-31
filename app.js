const express = require('express');
const cors = require('cors');
const chatRouter = require('./routes/chat');
const { router: enhanceRouter } = require('./utils/response-enhancer');
const registerCandidateRouter = require('./routes/register-candidate');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/phase1', chatRouter);  // Fixed route path
app.use('/api/ranker', enhanceRouter);  // New enhance response route
app.use('/api/register', registerCandidateRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Basic error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// IMPORTANT: Just export app, NO listen() here
module.exports = app;