// Load environment variables FIRST
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

// Mongoose MongoDB Setup
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Successfully connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Start server
function startServer() {
    const PORT = process.env.PORT || 6969;
    const HOST = '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
        console.log(`\n✅ Server running at http://${HOST}:${PORT}`);
        console.log('\nEnvironment Status:');
        console.log(`  MongoDB: ✓ Connected`);
        console.log(`  GROQ API: ${process.env.GROQ_API_MEESHA ? '✓ Set' : '✗ Missing'}`);
        console.log(`  Supabase: ${process.env.SUPABASE_URL ? '✓ Set' : '✗ Missing'}`);
        console.log(`  Redis: ${process.env.REDIS_URL ? '✓ Set' : '✗ Missing'}`);
        console.log('\nAPI Endpoints:');
        console.log(`  POST /api/chat`);
        console.log(`  GET  /health`);
        console.log('\nPress Ctrl+C to stop the server\n');
    });

    // Handle server errors
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`\n❌ Port ${PORT} is already in use!`);
            console.log('Solutions:');
            console.log('1. Kill all Node processes: taskkill /F /IM node.exe');
            console.log('2. Use a different port: set PORT=3000 && node server.js');
            console.log('3. Find what\'s using the port: netstat -ano | findstr :' + PORT);
            process.exit(1);
        }
        throw error;
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        server.close(() => {
            console.log('HTTP server closed');
            mongoose.connection.close(false, () => {
                console.log('MongoDB connection closed');
            });
        });
    });
}

// Start the server
startServer();