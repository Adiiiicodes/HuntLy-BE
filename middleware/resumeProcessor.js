// middleware/resumeProcessor.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const { pipeline } = require('@huggingface/transformers');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_API_KEY
);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// Filter to only allow PDF files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

// Configure upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max file size
});

// Text splitter function to divide text into chunks
function splitText(text, chunkSize = 1000, chunkOverlap = 200) {
  const chunks = [];
  let i = 0;
  
  while (i < text.length) {
    // Calculate end position with overlap
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.slice(i, end));
    
    // Move to next chunk with overlap
    i += chunkSize - chunkOverlap;
    if (i >= text.length) break;
    
    // Make sure we don't go backwards if overlap > current position
    i = Math.max(0, i);
  }
  
  return chunks;
}

// Function to extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    return pdfData.text;
  } catch (error) {
    console.error(`Error extracting text from PDF: ${error.message}`);
    throw error;
  }
}

// Function to generate embeddings for text chunks
async function generateEmbeddings(textChunks) {
  console.log("[LOG] Initializing HuggingFace pipeline...");
  
  // Create a feature-extraction pipeline
  const extractor = await pipeline(
    "feature-extraction",
    "sentence-transformers/all-MiniLM-L6-v2",
    { device: "cpu" }
  );
  
  console.log("[LOG] HuggingFace pipeline initialized.");
  
  // Generate embeddings for all chunks
  const embeddings = await extractor(textChunks, { 
    pooling: "mean", 
    normalize: true 
  });
  
  // Process embeddings to ensure they're in the correct format
  return embeddings.map(embedding => {
    let embeddingArray = embedding;
    
    // If the embedding is an object with ort_tensor.cpuData, extract and convert to array
    if (
      embeddingArray && 
      embeddingArray.ort_tensor && 
      embeddingArray.ort_tensor.cpuData && 
      typeof embeddingArray.ort_tensor.cpuData === "object"
    ) {
      embeddingArray = Object.values(embeddingArray.ort_tensor.cpuData);
    }
    
    // If it's a nested array, flatten it
    if (Array.isArray(embeddingArray) && Array.isArray(embeddingArray[0])) {
      embeddingArray = embeddingArray[0];
    }
    
    return embeddingArray;
  });
}

// Function to store embeddings in Supabase
// Function to store embeddings in Supabase
async function storeEmbeddings(textChunks, embeddings) {
    for (let i = 0; i < textChunks.length; i++) {
      try {
        console.log(`[LOG] Uploading embedding ${i} to Supabase...`);
        
        // Create embedding entry with only the columns that exist in your database
        const embeddingEntry = {
          content: textChunks[i],
          embedding: embeddings[i]
          // Remove the 'type' field since it doesn't exist in your database
        };
        
        const { data, error } = await supabase
          .from("huntlyembeddings")
          .insert([embeddingEntry]);
        
        if (error) {
          console.warn(`[WARN] Error uploading embedding ${i}:`, error);
        } else {
          console.log(`[LOG] Successfully uploaded embedding ${i} to Supabase.`);
        }
      } catch (error) {
        console.error(`[ERROR] Error uploading embedding ${i}: ${error.message}`);
      }
    }
  }

// Function to extract structured data from resume using Groq API with fetch
async function extractStructuredData(resumeText) {
  try {
    const apiKey = process.env.GROQ_API_MEESHA || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key not found in environment variables');
    }

    const prompt = `
    Extract the following information from this resume and return it in JSON format:
    
    Resume text:
    ${resumeText}
    
    Return a valid JSON object with these fields:
    - name: The person's full name
    - email: Their email address
    - phone: Their phone number
    - resume_text: The most relevant text from the resume containing experience, skills, education, etc. (max 1000 characters)
    
    Format your response as a valid JSON object with no additional text before or after the JSON.
    `;
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // Extract the JSON from the response
    const jsonText = responseData.choices[0].message.content.trim();
    
    // Parse the JSON
    let parsedData;
    try {
      parsedData = JSON.parse(jsonText);
    } catch (parseError) {
      // If direct parsing fails, try to extract JSON using regex
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }
    
    return parsedData;
  } catch (error) {
    console.error(`Error extracting structured data: ${error.message}`);
    throw error;
  }
}

// Function to store candidate data in Supabase
// Function to store candidate data in Supabase
// Function to store candidate data in MongoDB
async function storeCandidateData(candidateData) {
    try {
      console.log("[LOG] Storing candidate data in MongoDB...");
      
      // Use mongoose to create and save a new candidate document
      const mongoose = require('mongoose');
      
      // Create a schema if it doesn't exist yet
      let CandidateModel;
      try {
        // Try to get the existing model
        CandidateModel = mongoose.model('CandidateData');
      } catch (error) {
        // Model doesn't exist, so create it
        const candidateSchema = new mongoose.Schema({
          name: {
            type: String,
            required: true
          },
          email: {
            type: String
          },
          phone: {
            type: String
          },
          resume_text: {
            type: String
          },
          original_text: {
            type: String
          },
          filename: {
            type: String
          },
          upload_date: {
            type: Date,
            default: Date.now
          }
        }, { timestamps: true });
        
        // Create the model
        CandidateModel = mongoose.model('CandidateData', candidateSchema);
      }
      
      // Create a new candidate document
      const candidate = new CandidateModel(candidateData);
      
      // Save the candidate to the database
      const savedCandidate = await candidate.save();
      console.log("[LOG] Candidate data saved to MongoDB successfully");
      
      // Return an array with the saved document (to match the previous return format)
      return [{ id: savedCandidate._id.toString() }];
    } catch (error) {
      console.error(`[ERROR] Error storing candidate data in MongoDB: ${error.message}`);
      throw error;
    }
  }

// Main function to process a resume file
// Main function to process a resume file
async function processResume(filePath) {
    try {
      // Extract text from PDF
      console.log("[LOG] Extracting text from PDF:", filePath);
      const resumeText = await extractTextFromPDF(filePath);
      console.log("[LOG] Successfully extracted text, length:", resumeText.length);
      
      // Split text into chunks
      console.log("[LOG] Splitting text into chunks...");
      const textChunks = splitText(resumeText);
      console.log("[LOG] Text split into", textChunks.length, "chunks");
      
      // Generate embeddings for text chunks
      console.log("[LOG] Generating embeddings...");
      const embeddings = await generateEmbeddings(textChunks);
      console.log("[LOG] Successfully generated embeddings");
      
      // Store embeddings in Supabase
      console.log("[LOG] Storing embeddings in Supabase...");
      await storeEmbeddings(textChunks, embeddings);
      console.log("[LOG] Embeddings stored successfully");
      
      // Extract structured data from resume using LLM
      console.log("[LOG] Extracting structured data...");
      let candidateData;
      try {
        candidateData = await extractStructuredData(resumeText);
      } catch (extractError) {
        console.error("[ERROR] Failed to extract structured data:", extractError);
        // Create a basic candidate data object as fallback
        candidateData = {
          name: "Unknown",
          email: "unknown@example.com",
          phone: "Unknown",
          resume_text: resumeText.substring(0, 1000)
        };
      }
      console.log("[LOG] Structured data extracted:", Object.keys(candidateData));
      
      // Add original text and filename
      candidateData.original_text = resumeText;
      candidateData.filename = path.basename(filePath);
      candidateData.upload_date = new Date().toISOString();
      
      // Store candidate data in Supabase
      console.log("[LOG] Storing candidate data...");
      const storedData = await storeCandidateData(candidateData);
      console.log("[LOG] Candidate data stored, ID:", storedData?.[0]?.id);
      
      return {
        success: true,
        candidateId: storedData?.[0]?.id || `generated-${Date.now()}`,
        candidateData
      };
    } catch (error) {
      console.error(`[ERROR] Error processing resume: ${error?.message || error}`);
      throw error;
    }
  }

// Process multiple resumes
async function processMultipleResumes(filePaths) {
  const results = [];
  
  for (const filePath of filePaths) {
    try {
      const result = await processResume(filePath);
      results.push({
        filePath,
        success: true,
        candidateId: result.candidateId,
        candidateData: result.candidateData
      });
    } catch (error) {
      results.push({
        filePath,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

// Clean up uploaded files
function cleanupFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn(`Error deleting file ${filePath}: ${error.message}`);
    }
  }
}

module.exports = {
  upload,
  processResume,
  processMultipleResumes,
  cleanupFiles
};