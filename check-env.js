// check-env.js - Validates your .env file
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');

if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    console.log('Create one with: copy .env.example .env');
    process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split('\n');

console.log('Checking .env file...\n');

let hasErrors = false;

lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
        return;
    }
    
    // Check for spaces around equals sign
    if (line.includes(' = ') || line.includes('= ') || line.includes(' =')) {
        console.warn(`⚠️  Line ${lineNum}: Remove spaces around '=' sign`);
        console.log(`   Current: ${line}`);
        console.log(`   Should be: KEY=value (no spaces)\n`);
        hasErrors = true;
    }
    
    // Check for quotes (they're usually not needed)
    if (line.includes('"') || line.includes("'")) {
        console.warn(`⚠️  Line ${lineNum}: Quotes are usually not needed in .env files`);
        console.log(`   Current: ${line}`);
        console.log(`   Try: ${line.replace(/["']/g, '')}\n`);
    }
    
    // Check for Windows line endings
    if (line.includes('\r')) {
        console.warn(`⚠️  Line ${lineNum}: Windows line ending detected (\\r\\n)`);
        console.log(`   This might cause issues. Consider converting to Unix line endings (\\n)\n`);
    }
});

// Check for required keys
const requiredKeys = ['GROQ_API_MEESHA', 'SUPABASE_URL', 'SUPABASE_API_KEY'];
const envContent = content.toString();

requiredKeys.forEach(key => {
    const regex = new RegExp(`^${key}=`, 'm');
    if (!regex.test(envContent)) {
        console.error(`❌ Missing required key: ${key}`);
        hasErrors = true;
    }
});

if (!hasErrors) {
    console.log('✅ .env file looks good!');
} else {
    console.log('\n⚠️  Fix the issues above and try again.');
}