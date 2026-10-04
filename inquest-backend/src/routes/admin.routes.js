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

const { overrideDecision, analytics, listCases, adminNotifications } = require('../controllers/override.controller');
router.post('/override', requireAdminPassword, overrideDecision);
router.post('/analytics', requireAdminPassword, analytics);
router.post('/cases', requireAdminPassword, listCases);
router.post('/notifications', requireAdminPassword, adminNotifications);

const adminComplaints = require('../controllers/adminComplaint.controller');
router.post('/session', adminComplaints.createSession);
router.post('/complaints', requireAdminPassword, adminComplaints.list);
router.post('/complaints/detail', requireAdminPassword, adminComplaints.detail);
router.post('/complaints/investigate', requireAdminPassword, adminComplaints.investigate);
router.post('/complaints/resolve', requireAdminPassword, adminComplaints.resolve);

module.exports = router;
