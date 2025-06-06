const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // Add this
const chatRouter = require('./routes/chat');
const rankerRouter = require('./routes/ranker');
const registerCandidateRouter = require('./routes/register-candidate');
const candidateSearchRouter = require('./routes/candidate-search');
const counterMiddleware = require('./middleware/counter');
const counterRoutes = require('./routes/counter');
const authRouter = require('./routes/auth'); // Add this
const errorHandler = require('./middleware/error'); // Add this

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true // Allow cookies with CORS
}));
app.use(express.json());
app.use(cookieParser()); // Add this for handling JWT cookies
app.use(counterMiddleware);

// Register routes
app.use('/api/counter', counterRoutes);
app.use('/api/auth', authRouter); // Add this for auth routes
app.use('/api/chat', chatRouter);
app.use('/api/ranker', rankerRouter);
app.use('/api/register', registerCandidateRouter);
app.use('/api/candidates', candidateSearchRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        auth: 'enabled' // Add this to show auth is enabled
    });
});

// Use the comprehensive error handler instead of the basic one
app.use(errorHandler);

// IMPORTANT: Just export app, NO listen() here
module.exports = app;