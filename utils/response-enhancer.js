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
const enhanceResponse = async (initialResponse) => {
    try {
        console.log("Enhancing response...");

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are an expert response enhancer. Your task is to improve the given response by:\n" +
                            "1. Making it more concise and clear\n" +
                            "2. Ensuring it maintains the HTML format\n" +
                            "3. Adding relevant examples or analogies where helpful\n" +
                            "4. Improving the structure and flow\n" +
                            "5. Keeping the same information but presenting it better\n" +
                            "Return the enhanced response in valid HTML format."
                },
                {
                    role: "user",
                    content: `Please enhance this response while maintaining its HTML structure and core information:\n\n${initialResponse}`
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
        const { response } = req.query;

        if (!response) {
            return res.status(400).json({
                success: false,
                error: 'Response parameter is required'
            });
        }

        const enhancedResponse = await enhanceResponse(response);

        res.json({
            success: true,
            data: {

                enhancedResponse: enhancedResponse
            }
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