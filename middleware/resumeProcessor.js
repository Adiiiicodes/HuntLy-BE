// middleware/resumeProcessor.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const { pipeline } = require('@huggingface/transformers');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');

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

// Function to generate embeddings
async function generateEmbedding(text) {
  console.log("[LOG] Initializing HuggingFace pipeline...");
  
  // Create a feature-extraction pipeline
  const extractor = await pipeline(
    "feature-extraction",
    "sentence-transformers/all-MiniLM-L6-v2",
    { device: "cpu" }
  );
  
  console.log("[LOG] HuggingFace pipeline initialized.");
  
  // Generate embedding for the text
  const embeddings = await extractor([text], { 
    pooling: "mean", 
    normalize: true 
  });
  
  // Process embedding to ensure it's in the correct format
  let embeddingArray = embeddings[0];
  
  // Extract values from tensor if needed
  if (embeddingArray && embeddingArray.ort_tensor && embeddingArray.ort_tensor.cpuData) {
    embeddingArray = Object.values(embeddingArray.ort_tensor.cpuData);
  }
  
  // Flatten nested array if needed
  if (Array.isArray(embeddingArray) && Array.isArray(embeddingArray[0])) {
    embeddingArray = embeddingArray[0];
  }
  
  return embeddingArray;
}

// Function to store embedding in Supabase
async function storeEmbedding(text, embedding, filename) {
  try {
    console.log("[LOG] Storing embedding in Supabase...");
    
    // Create embedding entry
    const embeddingEntry = {
      content: text,
      embedding: embedding
    };
    
    // Log embedding info for debugging
    console.log(`[LOG] Embedding length: ${embedding.length}`);
    console.log(`[LOG] Content length: ${text.length} characters`);
    
    // Insert into Supabase
    const { data, error } = await supabase
      .from("huntlyembeddings")
      .insert([embeddingEntry]);
    
    if (error) {
      console.error(`[ERROR] Error uploading embedding to Supabase:`, error);
      throw error;
    }
    
    console.log(`[LOG] Successfully uploaded embedding to Supabase`);
    return data;
  } catch (error) {
    console.error(`[ERROR] Error storing embedding: ${error.message}`);
    throw error;
  }
}

// Function to extract structured data from resume
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

// Function to store candidate data in MongoDB
async function storeCandidateData(candidateData) {
  try {
    console.log("[LOG] Storing candidate data in MongoDB...");
    
    // Get or create the CandidateData model
    let CandidateModel;
    try {
      CandidateModel = mongoose.model('candidatedatas');
    } catch (error) {
      const candidateSchema = new mongoose.Schema({
        name: String,
        email: String,
        phone: String,
        resume_text: String,
        original_text: String,
        filename: String,
        upload_date: Date
      }, { timestamps: true });
      
      CandidateModel = mongoose.model('candidatedatas', candidateSchema);
    }
    
    // Create and save the candidate document
    const candidate = new CandidateModel(candidateData);
    const savedCandidate = await candidate.save();
    
    console.log("[LOG] Candidate saved with ID:", savedCandidate._id);
    return [{ id: savedCandidate._id.toString() }];
  } catch (error) {
    console.error(`[ERROR] Error storing candidate data: ${error.message}`);
    throw error;
  }
}

// Main function to process a resume file
async function processResume(filePath) {
  try {
    // Extract text from PDF
    console.log("[LOG] Processing resume:", filePath);
    const resumeText = await extractTextFromPDF(filePath);
    console.log("[LOG] Extracted text, length:", resumeText.length);
    
    // Generate embedding for the entire text
    const embedding = await generateEmbedding(resumeText);
    
    // Store the embedding in Supabase
    await storeEmbedding(resumeText, embedding, path.basename(filePath));
    
    // Extract structured data using LLM
    const candidateData = await extractStructuredData(resumeText);
    
    // Add additional information
    candidateData.original_text = resumeText;
    candidateData.filename = path.basename(filePath);
    candidateData.upload_date = new Date();
    
    // Store candidate data in MongoDB
    const storedData = await storeCandidateData(candidateData);
    
    return {
      success: true,
      candidateId: storedData[0].id,
      candidateData
    };
  } catch (error) {
    console.error(`[ERROR] Error processing resume: ${error.message}`);
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