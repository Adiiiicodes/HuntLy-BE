const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const dotenv = require('dotenv');
const { pipeline } = require("@huggingface/transformers");
const redis = require('redis');
const crypto = require('crypto');

// Load environment variables first
dotenv.config();

// Initialize Redis client
let redisClient = null;
const initRedis = async () => {
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
            redisClient = null;
        }
    }
};

// Initialize Redis connection
initRedis();

// Initialize Groq client
const groq = new Groq({ 
    apiKey: process.env.GROQ_API_MEESHA 
});

// Supabase Setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

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

// Get embedding function (unchanged from original)
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

// Generate response function (unchanged from original)
const generateResponse = async (context, query) => {
    try {
        console.log("Generating response for query:", query.substring(0, 100) + "...");

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a friendly, intelligent AI assistant with access to specific context documents. Always use the factual information from the provided context to answer the user's questions. If the context does not cover the question, and you have relevant knowledge on the topic, feel free to provide the answer from your general knowledge. However, if you're not sure or the context doesn't provide the answer, be honest and clearly let the user know you don't have that information from the context. Your goal is to be truthful and reliable, sticking to the content you've been given, while using your own knowledge only when necessary. At the same time, remain warm and conversational in tone, so the user feels they're talking to a thoughtful person rather than a machine.Pay close attention to the user's requests and preferences for style or detail. If they ask you to explain a complex topic in simple terms (for example, \"explain it like I'm 5\"), or to summarize an answer in a specific way (say, \"in two sentences\"), adapt your response to meet that need. Even if such stylistic requests aren't part of your context documents, it's important you honor them to keep your answer clear and engaging. In every case, communicate with empathy and clarity. Adjust your tone to match the user's level of knowledge and creativity – be it playful, professional, or simplified – while still delivering correct information from the context. By combining accurate, context-based facts with a personable, understanding tone, you ensure the user has a great experience and feels genuinely helped by a knowledgeable companion.**Return your answer strictly in valid HTML** , - Use headings (<h2>, <h3>), paragraphs (<p>), bold text, lists (<ul>, <li>), and so on. -Please return only plain HTML and do not use code fences like ```html or any Markdown code blocks."
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

// Similarity search function (unchanged from original)
const performSimilaritySearch = async (queryEmbedding, k = 3, matchThreshold = 0.1) => {
    try {
        console.log("Performing similarity search with embedding length:", queryEmbedding.length);
        console.log("First few values:", queryEmbedding.slice(0, 5));
        
        const response = await supabase.rpc('huntlysimilar', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: k
        });

        console.log("Supabase response:", response);

        if (!response.data || response.data.length === 0) {
            console.log("No matches found with threshold:", matchThreshold);
            return [];
        }

        return response.data;
    } catch (error) {
        console.error("Similarity Search Error:", error.message, error.stack);
        return [];
    }
};

// Main chat processing function with Redis caching
const processChat = async (userQuery) => {
    try {
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
        const context = similarDocs.length > 0 
            ? similarDocs.map(doc => doc.content || '').join('\n')
            : '';
        
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

// Express route handler example
const chatEndpoint = async (req, res) => {
    try {
        const { question } = req.body;
        const result = await processChat(question);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getEmbedding,
    generateResponse,
    performSimilaritySearch,
    processChat,
    chatEndpoint,
    initRedis
};