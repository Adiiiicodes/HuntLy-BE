const express = require('express');
const cors = require('cors');
const chatRouter = require('./routes/chat');
const rankerRouter = require('./routes/ranker');  // Use the dedicated router
const registerCandidateRouter = require('./routes/register-candidate');
const candidateSearchRouter = require('./routes/candidate-search');
const counterMiddleware = require('./middleware/counter');
const counterRoutes = require('./routes/counter');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.use(counterMiddleware);

// Register routes
app.use('/api/counter', counterRoutes);

// Routes - remove duplicate
app.use('/api/chat', chatRouter);  // Only include once
app.use('/api/ranker', rankerRouter);  // Use the dedicated router
app.use('/api/register', registerCandidateRouter);
app.use('/api/candidates', candidateSearchRouter);

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