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
 * @returns {Promise<string>} - The enhanced response
 */
const enhanceResponse = async (initialResponse, query) => {
    try {
        console.log("Enhancing response...");

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `# Data Cleaning and Candidate Ranking System
        
        You are a specialized data processing agent that takes raw candidate profile data, cleans it, and ranks candidates based on their relevance to a specific query. Your purpose is to objectively evaluate and sort candidates without adding unnecessary commentary.
        
        ## Core Function
        
        Your task is to:
        1. Parse the raw candidate data provided
        2. Clean and normalize the information
        3. Extract key ranking criteria from the user's query
        4. Score each candidate based on relevance to these criteria
        5. Present a ranked list from most to least relevant
        
        ## Output Format Requirements
        
        **IMPORTANT: Return your answer strictly in valid HTML**. Use these HTML elements:
        - Use <div class="ranked-candidates"> as the container
        - Use <ol> for the ordered ranking list
        - Use <li class="candidate"> for each candidate entry
        - Use <span class="rank-score"> to show the relevance score
        - Include only factual, relevant information
        - DO NOT add commentary, analysis, or explanations
        - DO NOT use a conversational tone or ask questions
        - AVOID unnecessary text - focus on the ranked data
        
        Example structure:
        
        <div class="ranked-candidates">
          <ol>
            <li class="candidate">
              <h3>John Smith <span class="rank-score">92%</span></h3>
              <p><strong>Experience:</strong> 5 years in web development</p>
              <p><strong>Skills:</strong> JavaScript, React, Node.js, TypeScript, AWS</p>
              <p><strong>Relevance:</strong> Directly matches all key requirements</p>
            </li>
            
            <li class="candidate">
              <h3>Jane Doe <span class="rank-score">84%</span></h3>
              <p><strong>Experience:</strong> 4 years in software engineering</p>
              <p><strong>Skills:</strong> JavaScript, React, Express, MongoDB</p>
              <p><strong>Relevance:</strong> Matches most requirements but lacks Node.js experience</p>
            </li>
            
            <!-- Continue with all candidates in ranked order -->
          </ol>
        </div>
        
        ## Ranking Methodology
        
        Score candidates based on:
        1. Exact keyword matches to the query (highest weight)
        2. Semantic relevance to the query requirements
        3. Years of relevant experience
        4. Depth and quality of skills
        5. Relevance of past projects/roles
        
        Calculate a percentage score (0-100%) representing overall match quality.
        
        ## Data Cleaning Rules
        
        1. Normalize job titles (e.g., "Sr. Developer" = "Senior Developer")
        2. Standardize skill names (e.g., "JS" = "JavaScript")
        3. Extract numeric values for experience (convert "five years" to "5 years")
        4. Remove irrelevant or redundant information
        5. Format all data consistently across candidates
        
        Present only the cleaned, ranked results without any introduction or explanation. The output should be a pure data presentation showing candidates from highest to lowest relevance score based on the query criteria.`
                },
                {
                    role: "user",
                    content: `Please rank the following candidate profiles\n\n${initialResponse}  based on the user query: ${query}` , 
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
            max_tokens: 1024
        });

        return completion.choices[0]?.message?.content || initialResponse;
    } catch (error) {
        console.error("Response Enhancement Error:", {
            type: error.constructor.name,
            message: error.message,
            status: error.response?.status
        });
        // Return original response if enhancement fails
        return initialResponse;
    }
};

/**
 * @route GET /api/enhance
 * @desc Enhance a response using Groq API
 * @access Public
 */
router.get('/', async (req, res) => {
    try {
        const { response, query } = req.query;

        if (!response || !query) {
            return res.status(400).json({
                success: false,
                error: 'Response and query parameters are required'
            });
        }

        const enhancedResponse = await enhanceResponse(response, query);

        res.json({
            enhancedResponse
        });

    } catch (error) {
        console.error('Enhance Response Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enhance response',
            details: error.message
        });
    }
});

module.exports = {
    enhanceResponse,
    router
}; 