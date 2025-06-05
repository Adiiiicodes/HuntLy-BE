// utils/rag-with-redis.js
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const { pipeline } = require("@huggingface/transformers");
const redis = require('redis');
const crypto = require('crypto');

// Delayed initialization variables
let redisClient = null;
let groq = null;
let supabase = null;
let initialized = false;

// Initialize all clients
const initialize = async () => {
    if (initialized) return;
    
    console.log('Initializing RAG services...');
    
    // Initialize Groq
    const groqApiKey = process.env.GROQ_API_MEESHA || process.env.GROQ_API_KEY;
    if (!groqApiKey) {
        throw new Error('Missing Groq API key. Please set GROQ_API_MEESHA or GROQ_API_KEY in your .env file');
    }
    groq = new Groq({ apiKey: groqApiKey });
    
    // Initialize Supabase
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_API_KEY) {
        throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_API_KEY in your .env file');
    }
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
    
    // Initialize Redis (optional)
    if (process.env.REDIS_URL) {
        try {
            redisClient = redis.createClient({
                url: process.env.REDIS_URL
            });
            
            redisClient.on('error', (err) => {
                console.error('Redis Client Error:', err);
            });
            
            await redisClient.connect();
            await redisClient.ping();
            console.log('Successfully connected to Redis');
        } catch (error) {
            console.error('Error connecting to Redis:', error);
            console.log('Continuing without Redis caching...');
            redisClient = null;
        }
    } else {
        console.log('Redis URL not provided, running without caching');
    }
    
    initialized = true;
    console.log('RAG services initialized successfully');
};

// Calculate cosine similarity between two vectors
const cosineSimilarity = (vecA, vecB) => {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (normA * normB);
};

// Find semantically similar cached query
const findSimilarCachedQuery = async (queryEmbedding, similarityThreshold = 0.85) => {
    if (!redisClient) {
        return { response: null, similarity: null };
    }
    
    try {
        // Get all embedding keys
        const embeddingKeys = await redisClient.keys('embedding:*');
        
        if (!embeddingKeys || embeddingKeys.length === 0) {
            return { response: null, similarity: null };
        }
        
        let maxSimilarity = 0;
        let mostSimilarHash = null;
        
        // Compare with each cached embedding
        for (const key of embeddingKeys) {
            const cachedEmbeddingStr = await redisClient.get(key);
            
            if (cachedEmbeddingStr) {
                const cachedEmbedding = JSON.parse(cachedEmbeddingStr);
                
                // Calculate similarity
                const similarity = cosineSimilarity(queryEmbedding, cachedEmbedding);
                
                console.log(`Similarity with ${key}: ${similarity}`);
                
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                    // Extract hash from key (remove "embedding:" prefix)
                    mostSimilarHash = key.split(':')[1];
                }
            }
        }
        
        // Check if similarity exceeds threshold
        if (maxSimilarity >= similarityThreshold) {
            // Get the corresponding response
            const responseKey = `chat:${mostSimilarHash}`;
            const cachedResponse = await redisClient.get(responseKey);
            
            if (cachedResponse) {
                console.log(`Found similar query with similarity: ${maxSimilarity}`);
                return { response: cachedResponse, similarity: maxSimilarity };
            }
        }
        
        return { response: null, similarity: null };
    } catch (error) {
        console.error('Error in semantic similarity search:', error);
        return { response: null, similarity: null };
    }
};

// Get embedding function
const getEmbedding = async (text) => {
    try {
        // Initialize the HuggingFace feature-extraction pipeline
        const extractor = await pipeline(
            "feature-extraction",
            "sentence-transformers/all-MiniLM-L6-v2",
            { device: "cpu" }
        );

        // Generate embedding for the input text
        const embeddingRaw = await extractor(text, { pooling: "mean", normalize: true });
        
        // Extract the actual embedding values from the Tensor object
        let embedding;
        if (embeddingRaw && embeddingRaw.ort_tensor && embeddingRaw.ort_tensor.cpuData) {
            // Extract from ort_tensor.cpuData
            embedding = Array.from(embeddingRaw.ort_tensor.cpuData);
        } else if (Array.isArray(embeddingRaw) && Array.isArray(embeddingRaw[0])) {
            // Handle nested array structure
            embedding = embeddingRaw[0];
        } else if (Array.isArray(embeddingRaw)) {
            // Handle flat array
            embedding = embeddingRaw;
        }

        if (!embedding || embedding.length === 0) {
            console.error("No embedding generated for input text.");
            throw new Error("No embedding generated");
        }

        console.log("Generated embedding with length:", embedding.length);
        return embedding;
    } catch (error) {
        console.error("Embedding Error:", {
            message: error.message
        });
        return null;
    }
};

// Generate response function - Modified to return JSON instead of HTML
// Generate response function - Modified to return JSON instead of HTML and handle code blocks
const generateResponse = async (context, query) => {
    try {
        console.log("Generating JSON response for query:", query.substring(0, 100) + "...");

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `# Candidate Search System

You are a candidate search system that retrieves relevant profiles based on the user's query. 
Your task is to analyze the query and return candidate information in a specific JSON format.

## Response Format
Your response MUST be ONLY a valid JSON object with this exact structure - DO NOT include markdown code blocks, backticks, or any other formatting:

{
  "candidates": [
    {
      "id": "cand_001",
      "name": "Candidate Name",
      "location": "Location (if available, otherwise give any location, including a country and a city)",
      "skills": ["Skill 1", "Skill 2", "Skill 3"],
      "experience": "Experience details",
      "experience_years": 5,
      "relevance_score": 85
    },
    {
      "id": "cand_002",
      "name": "Another Candidate",
      "location": "Location (if available, otherwise give any location, including a country and a city)",
      "skills": ["Skill A", "Skill B", "Skill C"],
      "experience": "Experience details",
      "experience_years": 3,
      "relevance_score": 75
    }
  ],
  "summary": "Brief summary of the search results"
}

## Critical Requirements:
1. Return ONLY raw JSON - no explanations, markdown, code blocks, backticks, or additional text
2. Include at least 10-12 relevant candidates for each query , and do not use John doe , Jane smith in names , use indian names atleast 80% names should be indian names
3. Each candidate must have all fields specified in the format
4. For each candidate, assign a relevance_score (0-100) based on how well they match the query
5. If details like location aren't available, give any random location in format of city, country
6. Skills must be an array of strings, not a comma-separated string
7. experience_years must be a number representing total years of experience
8. The summary should be brief but informative
9. NEVER wrap your response in \`\`\` or any other formatting

Input Format: The provided context contains relevant candidate information. Extract all applicable details.

User query: ${query}`
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nFind candidates matching this criteria: ${query}`
                }
            ],
            model: "compound-beta-mini",
            temperature: 0.2,
            max_tokens: 1500,
            response_format: { type: "json_object" }
        });

        let responseContent = completion.choices[0]?.message?.content;
        
        if (!responseContent) {
            throw new Error("No response generated by the model");
        }
        
        // Remove any markdown code block syntax that might be present
        responseContent = responseContent.replace(/```json\s*/g, '');
        responseContent = responseContent.replace(/```\s*$/g, '');
        responseContent = responseContent.replace(/^```/, '');
        responseContent = responseContent.replace(/```$/, '');
        responseContent = responseContent.trim();
        
        console.log("Cleaned response content:", responseContent.substring(0, 100) + "...");
        
        // Parse and validate the JSON response
        try {
            const parsedResponse = JSON.parse(responseContent);
            
            // Validate the response structure
            if (!parsedResponse.candidates || !Array.isArray(parsedResponse.candidates)) {
                console.error("Invalid response structure - missing candidates array");
                // Create a fallback response
                return JSON.stringify({
                    candidates: [
                        {
                            id: "cand_001",
                            name: "Fallback Candidate",
                            location: "Mumbai, India",
                            skills: ["Relevant Skill 1", "Relevant Skill 2", "Relevant Skill 3"],
                            experience: "Experience information not available",
                            experience_years: 0,
                            relevance_score: 50
                        }
                    ],
                    summary: "Limited candidate information available for your query."
                });
            }
            
            // Ensure each candidate has all required fields
            parsedResponse.candidates = parsedResponse.candidates.map((candidate, index) => {
                return {
                    id: candidate.id || `cand_${String(index + 1).padStart(3, '0')}`,
                    name: candidate.name || "Unknown Candidate",
                    location: candidate.location || "Mumbai, India",
                    skills: Array.isArray(candidate.skills) ? candidate.skills : 
                           (typeof candidate.skills === 'string' ? candidate.skills.split(',').map(s => s.trim()) : []),
                    experience: candidate.experience || "Not specified",
                    experience_years: typeof candidate.experience_years === 'number' ? candidate.experience_years : 0,
                    relevance_score: typeof candidate.relevance_score === 'number' ? candidate.relevance_score : 50
                };
            });
            
            // Ensure we have at least 2 candidates
            if (parsedResponse.candidates.length < 2) {
                parsedResponse.candidates.push({
                    id: `cand_${String(parsedResponse.candidates.length + 1).padStart(3, '0')}`,
                    name: "Additional Candidate",
                    location: "Delhi, India",
                    skills: ["Skill 1", "Skill 2", "Skill 3"],
                    experience: "Experience details not available",
                    experience_years: 1,
                    relevance_score: 50
                });
            }
            
            // Ensure we have a summary
            if (!parsedResponse.summary) {
                parsedResponse.summary = `Found ${parsedResponse.candidates.length} candidates matching your query.`;
            }
            
            return JSON.stringify(parsedResponse);
        } catch (parseError) {
            console.error("Error parsing LLM JSON response:", parseError);
            console.log("Raw response after cleaning:", responseContent);
            
            // Return a fallback JSON response
            return JSON.stringify({
                candidates: [
                    {
                        id: "cand_001",
                        name: "Fallback Candidate",
                        location: "Mumbai, India",
                        skills: ["Relevant Skill 1", "Relevant Skill 2", "Relevant Skill 3"],
                        experience: "Experience information not available",
                        experience_years: 0,
                        relevance_score: 50
                    },
                    {
                        id: "cand_002",
                        name: "Secondary Fallback Candidate",
                        location: "Delhi, India",
                        skills: ["Skill A", "Skill B", "Skill C"],
                        experience: "Experience information not available",
                        experience_years: 0,
                        relevance_score: 45
                    }
                ],
                summary: "Error processing candidate information. Showing fallback results."
            });
        }
    } catch (error) {
        console.error("Groq API Error:", {
            type: error.constructor.name,
            message: error.message,
            status: error.response?.status
        });
        
        // Return a structured error response
        return JSON.stringify({
            candidates: [
                {
                    id: "cand_001",
                    name: "Fallback Candidate",
                    location: "Mumbai, India",
                    skills: ["Relevant Skill 1", "Relevant Skill 2", "Relevant Skill 3"],
                    experience: "Experience information not available",
                    experience_years: 0,
                    relevance_score: 50
                },
                {
                    id: "cand_002",
                    name: "Secondary Fallback Candidate",
                    location: "Delhi, India",
                    skills: ["Skill A", "Skill B", "Skill C"],
                    experience: "Experience information not available",
                    experience_years: 0,
                    relevance_score: 45
                }
            ],
            summary: `Error generating response: ${error.message}`
        });
    }
};

// Similarity search function
const performSimilaritySearch = async (queryEmbedding, k = 3, matchThreshold = 0.2) => {
    try {
        console.log("Performing similarity search with embedding length:", queryEmbedding.length);
        console.log("Target match count:", k);
        console.log("Initial match threshold:", matchThreshold);
        
        // Initial search with moderate threshold and small k to avoid too large requests
        const response = await supabase.rpc('huntlysimilar', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: k
        });

        const resultCount = response.data?.length || 0;
        console.log(`Retrieved ${resultCount} profiles from initial search`);

        // If we got some results, return them
        if (resultCount > 0) {
            console.log(`Returning ${resultCount} profiles`);
            return response.data;
        }
        
        // If we didn't get any results, try with a lower threshold but still keep k small
        if (resultCount === 0) {
            console.log("No matches found. Trying with lower threshold...");
            
            const fallbackResponse = await supabase.rpc('huntlysimilar', {
                query_embedding: queryEmbedding,
                match_threshold: 0.1,  // Lower threshold
                match_count: 5         // Still keep count small
            });
            
            const fallbackCount = fallbackResponse.data?.length || 0;
            console.log(`Retrieved ${fallbackCount} profiles from fallback search`);
            
            if (fallbackCount > 0) {
                return fallbackResponse.data;
            }
        }
        
        // Last attempt with minimum threshold
        console.log("Making final attempt to retrieve profiles...");
        
        const finalResponse = await supabase.rpc('huntlysimilar', {
            query_embedding: queryEmbedding,
            match_threshold: 0.05,    // Very low threshold
            match_count: 7            // Still moderate count
        });
        
        const finalCount = finalResponse.data?.length || 0;
        console.log(`Retrieved ${finalCount} profiles from final search`);
        
        return finalResponse.data || [];
        
    } catch (error) {
        console.error("Similarity Search Error:", error.message, error.stack);
        return [];
    }
};

// Main chat processing function with Redis caching
const processChat = async (userQuery) => {
    try {
        // Ensure services are initialized
        await initialize();
        
        if (!userQuery) {
            throw new Error('No question provided');
        }

        // Generate cache key using SHA-256 hash
        const queryHash = crypto.createHash('sha256').update(userQuery).digest('hex');
        const responseCacheKey = `chat:${queryHash}`;
        const embeddingCacheKey = `embedding:${queryHash}`;
        
        // Check Redis cache first for exact match
        if (redisClient) {
            try {
                console.log(`Checking cache for key: ${responseCacheKey}`);
                const cachedResponse = await redisClient.get(responseCacheKey);
                
                if (cachedResponse) {
                    console.log("Exact cache hit - returning cached response");
                    return {
                        answer: cachedResponse,
                        cached: true,
                        context: 'From exact cache match'
                    };
                } else {
                    console.log("Exact cache miss - proceeding with query");
                }
            } catch (redisError) {
                console.error('Redis error during cache check:', redisError);
                // Continue with the request even if Redis fails
            }
        }

        // Generate embedding for query
        const queryEmbedding = await getEmbedding(userQuery);
        if (!queryEmbedding) {
            throw new Error('Failed to generate embedding');
        }
        
        // Check for semantically similar queries
        if (redisClient) {
            try {
                const { response: similarResponse, similarity } = await findSimilarCachedQuery(queryEmbedding);
                if (similarResponse) {
                    console.log(`Semantic cache hit with similarity: ${similarity}`);
                    return {
                        answer: similarResponse,
                        cached: true,
                        context: `From similar query (similarity: ${similarity.toFixed(2)})`
                    };
                }
            } catch (redisError) {
                console.error('Redis error during semantic search:', redisError);
            }
        }

        // Perform similarity search
        const similarDocs = await performSimilaritySearch(queryEmbedding, 2);
        console.log("Similar documents found:", similarDocs);
        
        const context = similarDocs.length > 0 
            ? similarDocs.map(doc => doc.content || '').join('\n')
            : '';
        
        console.log("Context being passed to generateResponse:", context);
        
        const response = await generateResponse(context, userQuery);
        
        // Cache both the embedding and the response
        if (redisClient && response && !response.startsWith("Error")) {
            try {
                // Cache the embedding (1 week TTL)
                await redisClient.setEx(
                    embeddingCacheKey,
                    parseInt(process.env.EMBEDDING_CACHE_TTL || '604800'),
                    JSON.stringify(queryEmbedding)
                );
                console.log(`Stored embedding in cache with key: ${embeddingCacheKey}`);
                
                // Cache the response (24 hours TTL)
                await redisClient.setEx(
                    responseCacheKey,
                    parseInt(process.env.CACHE_TTL || '86400'),
                    response
                );
                console.log(`Stored response in cache with key: ${responseCacheKey}`);
            } catch (redisError) {
                console.error('Redis error during cache storage:', redisError);
            }
        }

        return {
            answer: response,
            context: context,
            cached: false
        };

    } catch (error) {
        console.error('Error in chat processing:', error);
        throw error;
    }
};

module.exports = {
    getEmbedding,
    generateResponse,
    performSimilaritySearch,
    processChat,
    initialize
};