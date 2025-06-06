// middleware/counter.js
const Redis = require('ioredis');

// Initialize Redis clients
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const redisPub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const COUNTER_KEY = 'huntly:query_counter';
const CHANNEL = 'huntly:counter_updates';

/**
 * Middleware to increment the query counter for specific routes
 */
function counterMiddleware(req, res, next) {
  // Only increment for the chat API endpoint
  if (req.path === '/api/chat' && req.method === 'POST') {
    // Use Promise to avoid blocking the request
    Promise.resolve().then(async () => {
      try {
        // Increment the counter
        const newCount = await redis.incr(COUNTER_KEY);
        
        // Publish the new count to the channel
        await redisPub.publish(
          CHANNEL, 
          JSON.stringify({ count: newCount })
        );
        
        console.log(`Query counter incremented to ${newCount}`);
      } catch (error) {
        console.error('Error incrementing counter:', error);
        // We don't want to fail the request if counter fails
      }
    });
  }
  
  // Continue with request processing
  next();
}

module.exports = counterMiddleware;