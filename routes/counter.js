// routes/counter.js
const express = require('express');
const router = express.Router();
const Redis = require('ioredis');

// Initialize Redis clients
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const COUNTER_KEY = 'huntly:query_counter';
const CHANNEL = 'huntly:counter_updates';

// Helper function to set CORS headers
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res;
};

// GET endpoint to retrieve current count
router.get('/', async (req, res) => {
  try {
    // Get current count from Redis
    let count = await redis.get(COUNTER_KEY);
    
    // If count doesn't exist yet, initialize it
    if (!count) {
      await redis.set(COUNTER_KEY, 0);
      count = '0';
    }
    
    // Set CORS headers
    setCorsHeaders(res);
    
    // Cache control for standard endpoints
    res.setHeader('Cache-Control', 'no-cache');
    
    res.json({ count: parseInt(count) });
  } catch (error) {
    console.error('Error fetching counter:', error);
    res.status(500).json({ error: 'Failed to fetch counter' });
  }
});

// Dedicated mobile API endpoint with optimized response
router.get('/mobile', async (req, res) => {
  try {
    // Get current count from Redis
    let count = await redis.get(COUNTER_KEY);
    
    // If count doesn't exist yet, initialize it
    if (!count) {
      await redis.set(COUNTER_KEY, 0);
      count = '0';
    }
    
    // Set headers optimized for mobile
    setCorsHeaders(res);
    
    // Add specific cache headers for mobile to reduce bandwidth
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Content-Type', 'application/json');
    
    // Lightweight response for mobile
    res.json({ 
      count: parseInt(count),
      timestamp: Date.now() 
    });
  } catch (error) {
    console.error('Error fetching mobile counter:', error);
    res.status(500).json({ error: 'Failed to fetch counter' });
  }
});

// Improved SSE endpoint for real-time counter updates with better mobile compatibility
router.get('/stream', async (req, res) => {
  // Initialize a separate Redis client for subscription
  const redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  // Set enhanced headers for SSE with mobile compatibility
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Important for Nginx proxies
  
  // Send a comment line to establish connection
  res.write(':\n\n'); // Heartbeat to keep connection alive
  
  // Send initial count immediately
  try {
    let count = await redisClient.get(COUNTER_KEY);
    if (!count) {
      await redisClient.set(COUNTER_KEY, 0);
      count = '0';
    }
    
    // Use proper SSE format with event type
    res.write(`event: message\n`);
    res.write(`id: ${Date.now()}\n`);
    res.write(`data: ${JSON.stringify({ count: parseInt(count), timestamp: Date.now() })}\n\n`);
    
    // Flush the response to ensure immediate delivery
    if (res.flush) {
      res.flush();
    }
  } catch (error) {
    console.error('Error sending initial SSE data:', error);
  }
  
  // Set up heartbeat to prevent connection timeouts (especially on mobile)
  const heartbeatInterval = setInterval(() => {
    res.write(':\n\n'); // SSE comment as heartbeat
    if (res.flush) res.flush();
  }, 30000); // Every 30 seconds
  
  // Subscribe to Redis channel for updates
  redisSub.subscribe(CHANNEL);
  
  // Handle messages from Redis
  redisSub.on('message', (channel, message) => {
    if (channel === CHANNEL) {
      try {
        // Use proper SSE format with event type and ID
        res.write(`event: message\n`);
        res.write(`id: ${Date.now()}\n`);
        res.write(`data: ${message}\n\n`);
        
        // Flush to ensure immediate delivery
        if (res.flush) {
          res.flush();
        }
      } catch (error) {
        console.error('Error sending SSE update:', error);
      }
    }
  });
  
  // Handle connection errors
  redisSub.on('error', (error) => {
    console.error('Redis subscription error:', error);
    clearInterval(heartbeatInterval);
    
    // Try to send an error event to client
    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Redis subscription error' })}\n\n`);
    } catch (e) {
      // Connection might already be closed
    }
    
    // Clean up
    redisSub.unsubscribe(CHANNEL);
    redisSub.quit();
    redisClient.quit();
  });
  
  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    redisSub.unsubscribe(CHANNEL);
    redisSub.quit();
    redisClient.quit();
  });
});

// Increment counter function to be used as middleware
const incrementCounter = async (req, res, next) => {
  try {
    // Increment counter in Redis
    const newCount = await redis.incr(COUNTER_KEY);
    
    // Publish update to Redis channel
    await redis.publish(CHANNEL, JSON.stringify({ 
      count: newCount,
      timestamp: Date.now()
    }));
    
    // Continue with request processing
    next();
  } catch (error) {
    console.error('Error incrementing counter:', error);
    // Continue processing even if counter fails
    next();
  }
};

// Export router and increment middleware
module.exports = router;
module.exports.incrementCounter = incrementCounter;