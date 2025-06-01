const { groq } = require('../config/groq');

const formatCandidates = async (response, query) => {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a data extraction system that converts HTML candidate profiles into structured JSON format.
                    
                    Your task is to:
                    1. Extract candidate information from the provided HTML response
                    2. Format each candidate into a specific JSON structure
                    3. Return an array of candidate objects
                    
                    Required JSON structure for each candidate:
                    {
                        "id": "cand_XXX", // Generate sequential IDs starting from 001 IF THEIR IS NO ID MENTIONED IN THE REPSONSE THEN YOU SHOULD GENERATE ANY RANDOM ID 
                        "name": "Full Name", // IF THEIR IS NO NAME MENTIONED IN THE REPSONSE THEN YOU SHOULD GENERATE ANY RANDOM NAME
                        "location": "City/Country", // IF THEIR IS NO LOCATION MENTIONED IN THE REPSONSE THEN YOU SHOULD GENERATE ANY RANDOM LOCATION
                        "skills": ["Skill1", "Skill2", ...], // IF THEIR IS NO SKILLS MENTIONED IN THE REPSONSE THEN YOU SHOULD GENERATE ANY RANDOM SKILLS
                        "experience_years": number // IF THEIR IS NO EXPERIENCE MENTIONED IN THE REPSONSE THEN YOU SHOULD GENERATE ANY RANDOM EXPERIENCE
                    }
                    
                    Rules:
                    - If any field cannot be detected, GENERATE RANDOM DATA FOR THAT FIELD
                    - For skills, extract them from the skills section and convert to array
                    - For experience_years, try to extract numeric value from experience
                    - Generate sequential IDs (cand_001, cand_002, etc.)
                    - Return the final result as a valid JSON array
                    - IMPORTANT: Your response must be ONLY the JSON array, no other text or explanation
                    
                    Example output:
                    [
                        {
                            "id": "cand_001",
                            "name": "John Smith",
                            "location": "New York",
                            "skills": ["JavaScript", "React", "Node.js"],
                            "experience_years": 5
                        },
                        {
                            "id": "cand_002",
                            "name": "Jane Doe",
                            "location": "London",
                            "skills": ["Python", "Django", "AWS"],
                            "experience_years": 3
                        }
                    ]`
                },
                {
                    role: "user",
                    content: `HTML Response: ${response}\n\nOriginal Query: ${query}\n\nIMPORTANT: Return ONLY the JSON array, no other text or explanation.`
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // Lower temperature for more consistent JSON output
            max_tokens: 1024,
            response_format: { type: "json_object" } // Force JSON response
        });

        const formattedResponse = completion.choices[0]?.message?.content;
        
        // Parse the response to ensure it's valid JSON
        try {
            // Clean the response in case there's any extra text
            const cleanResponse = formattedResponse.trim();
            const parsedResponse = JSON.parse(cleanResponse);
            
            // Handle both direct array and object with candidates array
            const candidatesArray = Array.isArray(parsedResponse) 
                ? parsedResponse 
                : parsedResponse.candidates || [];

            if (!Array.isArray(candidatesArray)) {
                throw new Error("Response does not contain a valid candidates array");
            }
            
            return candidatesArray;
        } catch (parseError) {
            console.error("Error parsing formatted response:", parseError);
            console.error("Raw response:", formattedResponse);
            throw new Error("Failed to parse formatted response into JSON");
        }
    } catch (error) {
        console.error("Error formatting candidates:", error);
        throw error;
    }
};

module.exports = {
    formatCandidates
}; 