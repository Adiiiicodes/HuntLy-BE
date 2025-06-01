// utils/response-enhancer.js
const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

// Initialize Groq client
const groq = new Groq({ 
    apiKey: process.env.GROQ_API_MEESHA || process.env.GROQ_API_KEY 
});

/**
 * Enhances the initial response with additional processing
 * @param {string} initialResponse - The response from the first Groq API call
 * @param {string} query - The user's search query
 * @returns {Promise<object>} - The enhanced structured response
 */
const enhanceResponse = async (initialResponse, query) => {
    try {
        console.log("Enhancing response...");
        
        // Check if the input is HTML and process accordingly
        if (initialResponse.includes('<div class="candidate">')) {
            console.log("Input appears to be HTML, extracting structured data...");
            return extractCandidatesFromHTML(initialResponse);
        }
        
        // Otherwise, try to convert using Groq
        console.log("Requesting structured data from Groq...");
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `# Candidate Processing System

You are a data processing system that extracts and structures candidate information from resume data and ranks candidates based on their relevance to a specific query: ${query}. Your purpose is to objectively evaluate and sort candidates without adding unnecessary commentary.Your output must follow the exact format specified below.

## Output Format Requirements

You MUST respond with ONLY a valid JSON object in this EXACT format:
{
  "data": [
    {
      "id": "auto_generated_id",
      "rank": "1",
      "name": "Candidate Full Name",
      "location": "City",
      "skills": ["Skill1", "Skill2", "Skill3"],
      "experience_years": 5
    }
  ]
}

## Critical Rules
1. Return ONLY the JSON object - no explanations, markdown, code blocks, or additional text
2. The output must be valid, parseable JSON
3. The "data" field must be an array containing all candidates
4. Each candidate must have these exact fields: "id", "name", "location", "skills", "experience_years"
5. For "id", use "cand_" followed by a 3-digit number (e.g., "cand_001")
6. The "skills" field must be an array of strings with all skills mentioned
7. The "experience_years" field must be an integer representing total years of experience
8. Extract all information from the provided candidate profiles
9. If location is not specified, use "Not specified"
10. For "name", extract the full name of the candidate`
                },
                {
                    role: "user",
                    content: `Extract structured information from these candidate profiles:\n\n${initialResponse}\n\nUser query for reference: ${query}`
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            max_tokens: 1024,
            response_format: { type: "json_object" }
        });

        // Get the content from the completion
        let responseContent = completion.choices[0]?.message?.content;
        
        try {
            // Parse the JSON string
            const parsedResponse = JSON.parse(responseContent);
            
            // Add success field to the result
            return {
                success: true,
                ...parsedResponse
            };
        } catch (parseError) {
            console.error("Error parsing Groq response as JSON:", parseError);
            console.log("Response content:", responseContent);
            
            // If it fails to parse, try extracting from it as HTML
            if (responseContent.includes('<div class="candidate">')) {
                return extractCandidatesFromHTML(responseContent);
            }
            
            // If all else fails, return error
            return {
                success: false,
                error: "Failed to parse response",
                rawResponse: responseContent
            };
        }
    } catch (error) {
        console.error("Response Enhancement Error:", {
            type: error.constructor.name,
            message: error.message,
            status: error.response?.status
        });
        // Return error response
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Extracts structured candidate data from HTML content
 * @param {string} htmlContent - HTML containing candidate information
 * @returns {object} - Structured candidate data
 */
const extractCandidatesFromHTML = (htmlContent) => {
    try {
        // Clean up escaped quotes and newlines
        const cleanedHtml = htmlContent.replace(/\\"/g, '"').replace(/\\n/g, '\n');
        
        // Use a regular expression to extract candidate information
        const candidateRegex = /<div class="candidate">\s*<h3>([^<]+)<\/h3>\s*<p><strong>Experience:<\/strong>([^<]+)<\/p>\s*<p><strong>Skills:<\/strong>([^<]+)<\/p>/g;
        
        const candidates = [];
        let match;
        let counter = 1;
        
        while ((match = candidateRegex.exec(cleanedHtml)) !== null) {
            const name = match[1].trim();
            const experienceText = match[2].trim();
            const skillsText = match[3].trim();
            
            // Extract years from experience (approximate)
            const yearsRegex = /(\d+)\s*years|(\d+)\s*year|\((\d{4})\s*-\s*Present\)|\((\d{4})\s*-\s*(\d{4})\)/;
            const yearsMatch = experienceText.match(yearsRegex);
            
            let experienceYears = 0;
            if (yearsMatch) {
                if (yearsMatch[1]) {
                    experienceYears = parseInt(yearsMatch[1]);
                } else if (yearsMatch[2]) {
                    experienceYears = parseInt(yearsMatch[2]);
                } else if (yearsMatch[3]) {
                    // Case of (YYYY - Present)
                    const startYear = parseInt(yearsMatch[3]);
                    const currentYear = new Date().getFullYear();
                    experienceYears = currentYear - startYear;
                } else if (yearsMatch[4] && yearsMatch[5]) {
                    // Case of (YYYY - YYYY)
                    const startYear = parseInt(yearsMatch[4]);
                    const endYear = parseInt(yearsMatch[5]);
                    experienceYears = endYear - startYear;
                }
            }
            
            // Extract location (this is approximate)
            const locationMatch = experienceText.match(/at\s+[^(]+ \(([^,]+)/);
            const location = locationMatch ? locationMatch[1].trim() : "Not specified";
            
            // Parse skills into an array
            const skills = skillsText.split(',').map(skill => skill.trim());
            
            candidates.push({
                id: `cand_${String(counter).padStart(3, '0')}`,
                name,
                location,
                skills,
                experience_years: experienceYears || 1 // Default to 1 if we couldn't extract years
            });
            
            counter++;
        }
        
        return {
            success: true,
            data: candidates
        };
    } catch (error) {
        console.error("Error extracting candidates from HTML:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Add GET handler to match what's in ranker.js
router.get('/', async (req, res) => {
    try {
        const { initialResponse, query } = req.query;

        if (!initialResponse) {
            return res.status(400).json({
                success: false,
                error: 'initialResponse parameter is required'
            });
        }

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query parameter is required'
            });
        }

        const result = await enhanceResponse(initialResponse, query);
        res.json(result);
    } catch (error) {
        console.error('Enhance Response Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enhance response',
            details: error.message
        });
    }
});

// Keep the POST handler
router.post('/', async (req, res) => {
    try {
        const { initialResponse, query } = req.body;

        if (!initialResponse || !query) {
            return res.status(400).json({
                success: false,
                error: 'initialResponse and query parameters are required'
            });
        }

        const result = await enhanceResponse(initialResponse, query);
        res.json(result);
    } catch (error) {
        console.error('Enhance Response Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enhance response',
            details: error.message
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'response-enhancer',
        timestamp: new Date().toISOString() 
    });
});

// Export both the utility functions and the router
module.exports = {
    enhanceResponse,
    extractCandidatesFromHTML,
    router
};