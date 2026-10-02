const express = require('express');
const router = express.Router();
const { requireAdminPassword } = require('../middleware/adminAuth');
const {
  getOverview,
  getOrCreateProfile,
  updateProfilePhoto,
  updateProfileName,
} = require('../controllers/admin.controller');

router.post('/overview', requireAdminPassword, getOverview);
router.post('/profile', requireAdminPassword, getOrCreateProfile);
router.post('/profile/photo', requireAdminPassword, updateProfilePhoto);
router.post('/profile/name', requireAdminPassword, updateProfileName);

const { getAuditLog } = require('../controllers/audit.controller');
router.post('/audit', requireAdminPassword, getAuditLog);

const { getRiskBoard } = require('../controllers/risk.controller');
router.post('/risk', requireAdminPassword, getRiskBoard);

module.exports = router;
