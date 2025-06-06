const jwt = require('jsonwebtoken');

// Get JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-change-this-in-production';
const JWT_EXPIRES_IN = '2d'; // 2 days

/**
 * Create JWT token
 * @param {Object} payload - Data to be stored in token
 * @returns {String} JWT token
 */
const createToken = (payload) => {
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

module.exports = {
  createToken,
  verifyToken,
  JWT_EXPIRES_IN
};