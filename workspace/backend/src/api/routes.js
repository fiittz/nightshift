const express = require('express');
const router = express.Router();
const { processData, validateInput } = require('../utils/dataProcessor');

// Fixed: Added error handling wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Fixed: Added try-catch and standardized error response
router.post('/api/data', asyncHandler(async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ 
        error: 'ValidationError',
        message: 'Data field is required' 
      });
    }
    
    const isValid = validateInput(data);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'ValidationError',
        message: 'Invalid data format' 
      });
    }
    
    const result = await processData(data);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Data processing error:', error);
    res.status(500).json({ 
      error: 'InternalServerError',
      message: 'An unexpected error occurred' 
    });
  }
}));

// Fixed: Added validation and error handling
router.get('/api/data/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || id.length < 1) {
      return res.status(400).json({ 
        error: 'ValidationError',
        message: 'Valid ID is required' 
      });
    }
    
    // Simulate database fetch
    const data = await fetchDataById(id);
    
    if (!data) {
      return res.status(404).json({ 
        error: 'NotFoundError',
        message: 'Data not found' 
      });
    }
    
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Data fetch error:', error);
    res.status(500).json({ 
      error: 'InternalServerError',
      message: 'Failed to fetch data' 
    });
  }
}));

// Helper function (to be implemented)
async function fetchDataById(id) {
  // TODO: Implement actual database fetch
  return null;
}

module.exports = router;
