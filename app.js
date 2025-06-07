const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const chatRouter = require('./routes/chat');
const rankerRouter = require('./routes/ranker');
const registerCandidateRouter = require('./routes/register-candidate');
const candidateSearchRouter = require('./routes/candidate-search');
const counterMiddleware = require('./middleware/counter');
const counterRoutes = require('./routes/counter');
const authRouter = require('./routes/auth');
const resumeUploadRouter = require('./routes/resume-upload'); // Add this
const profileSaveRouter = require('./routes/profile-save'); // Add this
const errorHandler = require('./middleware/error');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true // Allow cookies with CORS
}));
app.use(express.json());
app.use(cookieParser());
app.use(counterMiddleware);

// Register routes
app.use('/api/counter', counterRoutes);
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/ranker', rankerRouter);
app.use('/api/register', registerCandidateRouter);
app.use('/api/candidates', candidateSearchRouter);
app.use('/api/resumes', resumeUploadRouter); // Add resume upload routes
app.use('/api/profiles', profileSaveRouter); // Add profile save routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        auth: 'enabled',
        resume_upload: 'enabled', // Add this to show resume upload is enabled
        profile_save: 'enabled'   // Add this to show profile save is enabled
    });
});

// Use the comprehensive error handler
app.use(errorHandler);

// IMPORTANT: Just export app, NO listen() here
module.exports = app;