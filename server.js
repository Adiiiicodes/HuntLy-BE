// Load environment variables FIRST
require('dotenv').config();

const app = require('./app');
const { MongoClient } = require('mongodb');

// MongoDB Setup
const MONGO_URI = process.env.MONGO_URI;
let client, db, userQuestionsCollection;

async function connectToMongo() {
    if (!MONGO_URI) {
        console.log("MongoDB URI not provided, skipping MongoDB connection");
        return;
    }
    
    try {
        client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 30000,
            retryWrites: true,
            w: 'majority'
        });

        await client.connect();
        await client.db("admin").command({ ping: 1 });
        db = client.db("os_chatbot");
        userQuestionsCollection = db.collection("user_questions");
        console.log("✅ Successfully connected to MongoDB");
    } catch (error) {
        console.error(`❌ Error connecting to MongoDB: ${error.message}`);
        console.log("Continuing without MongoDB...");
        client = null;
        db = null;
        userQuestionsCollection = null;
    }
}

// Start server
async function startServer() {
    // Connect to MongoDB first
    await connectToMongo();
    
    const PORT = process.env.PORT || 6969;
    // FIXED: Use 0.0.0.0 for Render compatibility
    const HOST = '0.0.0.0';
    
    // Only ONE listen call in the entire application
    const server = app.listen(PORT, HOST, () => {
        console.log(`\n✅ Server running at http://${HOST}:${PORT}`);
        console.log('\nEnvironment Status:');
        console.log(`  MongoDB: ${client ? '✓ Connected' : '✗ Not connected'}`);
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
            if (client) {
                client.close();
                console.log('MongoDB connection closed');
            }
        });
    });
}

// Export MongoDB collections for use in other files
module.exports = {
    getDb: () => db,
    getUserQuestionsCollection: () => userQuestionsCollection
};

// Start the server
startServer().catch(console.error);