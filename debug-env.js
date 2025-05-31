// debug-env.js - Run this to check your environment setup
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

console.log('=== Environment Debug Info ===\n');

// Show current working directory
console.log('Current directory:', process.cwd());

// Check if .env file exists
const envPath = path.join(process.cwd(), '.env');
console.log('.env file path:', envPath);
console.log('.env file exists:', fs.existsSync(envPath));

// Load dotenv
const result = dotenv.config();

if (result.error) {
    console.log('\nError loading .env:', result.error);
} else {
    console.log('\n.env loaded successfully');
}

// Check specific environment variables
console.log('\n=== Groq API Keys ===');
console.log('GROQ_API_MEESHA:', process.env.GROQ_API_MEESHA ? '✓ Set' : '✗ Not set');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✓ Set' : '✗ Not set');

console.log('\n=== Other Required Variables ===');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Not set');
console.log('SUPABASE_API_KEY:', process.env.SUPABASE_API_KEY ? '✓ Set' : '✗ Not set');
console.log('REDIS_URL:', process.env.REDIS_URL ? '✓ Set' : '✗ Not set');

// Show first few characters of keys (masked for security)
if (process.env.GROQ_API_MEESHA) {
    console.log('\nGROQ_API_MEESHA starts with:', process.env.GROQ_API_MEESHA.substring(0, 10) + '...');
}

// List all env vars (be careful with this in production!)
console.log('\n=== All Environment Variables ===');
console.log('Total env vars:', Object.keys(process.env).length);

// Show .env file content (first few lines)
if (fs.existsSync(envPath)) {
    console.log('\n=== .env File Preview ===');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n').slice(0, 5);
    lines.forEach((line, i) => {
        // Mask the values for security
        const masked = line.replace(/=(.+)/, '=***HIDDEN***');
        console.log(`Line ${i + 1}: ${masked}`);
    });
}