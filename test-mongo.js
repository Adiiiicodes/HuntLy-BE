require('dotenv').config();
const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  resume_text: String
});
const Candidate = mongoose.model('Candidate', candidateSchema, 'resumes');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const doc = await Candidate.create({
      name: "Test User",
      email: "test@example.com",
      phone: "1234567890",
      resume_text: "Test resume"
    });
    console.log('Inserted:', doc);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });