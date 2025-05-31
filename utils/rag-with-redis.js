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

// Generate response function
const generateResponse = async (context, query) => {
    try {
        console.log("Generating response for query:", query.substring(0, 100) + "...");

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `# Candidate Listing System
        
        You are a resume data extraction system that lists all candidate profiles that match a given query. Your purpose is to simply extract and display relevant candidate information without analysis, ranking, or conversation.
        
        ## Core Function
        
        Your only task is to:
        - Identify ALL candidates/profiles from the provided context that match the query
        - List their relevant information in a structured format
        - Present the data in a simple, direct manner
        
        ## Output Format Requirements
        
        **IMPORTANT: Return your answer strictly in valid HTML**. Use proper HTML elements:
        - Begin with a VERY brief introduction like "Here are the candidates that match your query:" or "Here is the information you requested:"
        - Use <div class="candidates-list"> to contain the entire list
        - Use <div class="candidate"> for each candidate profile
        - Use <h3> for candidate names
        - Use paragraphs (<p>) with <strong> tags for information categories
        - DO NOT include any analysis, commentary, or questions
        - DO NOT rank or score the candidates
        - DO NOT use a conversational tone
        - DO NOT use code fences or Markdown - return only plain HTML
        
        Example structure:
        
        <div class="response">
          <p>Here are the candidates that match your query:</p>
          
          <div class="candidates-list">
            <div class="candidate">
              <h3>John Smith</h3>
              <p><strong>Experience:</strong> 5 years in web development</p>
              <p><strong>Skills:</strong> JavaScript, React, Node.js, TypeScript, AWS</p>
              <p><strong>Education:</strong> BS Computer Science, XYZ University</p>
              <p><strong>Background:</strong> Led development team at ABC Company, created responsive web applications</p>
            </div>
            
            <div class="candidate">
              <h3>Jane Doe</h3>
              <p><strong>Experience:</strong> 4 years in software engineering</p>
              <p><strong>Skills:</strong> JavaScript, React, Express, MongoDB</p>
              <p><strong>Education:</strong> MS Software Engineering, ABC University</p>
              <p><strong>Background:</strong> Full-stack developer at XYZ Corp, designed microservices architecture</p>
            </div>
            
            <!-- Include ALL matching candidates here -->
          </div>
        </div>
        
        ## Processing Guidelines
        
        1. Extract ALL candidate profiles that match the query criteria
        2. Include relevant details for each candidate (experience, skills, education, background)
        3. Present information in a consistent format across all candidates
        4. Keep descriptions factual and concise
        5. Include EVERY matching candidate, not just top matches
        6. Do not add any subjective analysis or commentary
        7. Start with only a brief 1-line introduction
        
        Always list every matching candidate from the provided context. Do not filter out or rank candidates based on your own assessment. Simply present all relevant profiles in a clean, structured format.`
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${query}`
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
            max_tokens: 1024
        });

        return completion.choices[0]?.message?.content || "No response generated";
    } catch (error) {
        console.error("Groq API Error:", {
            type: error.constructor.name,
            message: error.message,
            status: error.response?.status
        });
        return `Error generating response: ${error.message}`;
    }
};

// Similarity search function
const performSimilaritySearch = async (queryEmbedding, k = 10, matchThreshold = 0.05) => {
    try {
        console.log("Performing similarity search with embedding length:", queryEmbedding.length);
        console.log("First few values:", queryEmbedding.slice(0, 5));
        console.log("Using match threshold:", matchThreshold);
        
        const response = await supabase.rpc('huntlysimilar', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: k
        });

        console.log("Raw Supabase response:", JSON.stringify(response, null, 2));

        if (!response.data || response.data.length === 0) {
            console.log("No matches found with threshold:", matchThreshold);
            // Try with an even lower threshold
            if (matchThreshold > 0.01) {
                console.log("Retrying with lower threshold...");
                return performSimilaritySearch(queryEmbedding, k, matchThreshold * 0.5);
            }
            return [];
        }

        console.log("Found matches:", response.data.length);
        return response.data;
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