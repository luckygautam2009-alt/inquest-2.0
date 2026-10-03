const express = require('express');
const router = express.Router();
const { submitComplaint } = require('../controllers/complaint.controller');
const { confirmProposal } = require('../controllers/proposal.controller');
const { complaintValidationRules } = require('../middleware/validators/complaintValidator');
const { validate } = require('../middleware/validate');
const { upload } = require('../config/upload');
const { attachCustomer, enforceAuth, bindCustomer } = require('../middleware/customerAuth');

// JSON (no photo) and multipart/form-data (up to 3 photos) are both accepted.
// A signed-in customer is always bound to their own id.
router.post('/', attachCustomer, enforceAuth, upload.array('photos', 3), bindCustomer, complaintValidationRules, validate, submitComplaint);
router.post('/confirm', attachCustomer, enforceAuth, bindCustomer, confirmProposal);

module.exports = router;
