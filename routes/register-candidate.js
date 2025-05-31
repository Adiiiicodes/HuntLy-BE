const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidates');

// POST /api/register
router.post('/', async (req, res) => {
    console.log("Registering candidate" , req.body);
  try {
    const { name, email, phone, resume_text } = req.body;

    if (!name || !resume_text) {
      return res.status(400).json({ success: false, error: 'Name and resume_text are required.' });
    }

    const candidate = new Candidate({
      name,
      email: email || "Not Provided",
      phone: phone || "Not Provided",
      resume_text
    });

    await candidate.save();

    res.json({ success: true, message: 'Candidate registered successfully.' });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ success: false, error: 'Failed to register candidate.' });
  }
});

module.exports = router;