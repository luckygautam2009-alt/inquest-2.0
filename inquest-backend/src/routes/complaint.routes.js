const express = require('express');
const router = express.Router();
const { submitComplaint } = require('../controllers/complaint.controller');
const { complaintValidationRules } = require('../middleware/validators/complaintValidator');
const { validate } = require('../middleware/validate');
const { upload } = require('../config/upload');

// JSON body (no photo) and multipart/form-data (up to 3 photos) are both accepted
router.post('/', upload.array('photos', 3), complaintValidationRules, validate, submitComplaint);

const { confirmProposal } = require('../controllers/proposal.controller');
router.post('/confirm', confirmProposal);

module.exports = router;
