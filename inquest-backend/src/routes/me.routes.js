const express = require('express');
const router = express.Router();
const notifications = require('../services/notificationService');
const complaints = require('../services/complaintService');
const { attachCustomer } = require('../middleware/customerAuth');
const { upload } = require('../config/upload');

function needSession(req, res, next) {
  if (!req.customer) return res.status(401).json({ success: false, error: 'Please sign in to continue.' });
  next();
}

router.use(attachCustomer, needSession);

router.get('/notifications', (req, res) => {
  const customerId = req.customer.id;
  res.status(200).json({
    success: true,
    data: { notifications: notifications.list({ audience: 'customer', customerId, limit: 30 }), unread: notifications.unreadCount({ audience: 'customer', customerId }) },
  });
});

router.post('/notifications/read', (req, res) => {
  const ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : null;
  const changed = notifications.markRead({ audience: 'customer', customerId: req.customer.id, ids });
  res.status(200).json({ success: true, data: { changed } });
});

router.get('/complaints', (req, res) => {
  res.status(200).json({ success: true, data: complaints.listForCustomer(req.customer.id) });
});

// Customers only REGISTER a complaint. Investigation and resolution are done by staff.
router.post('/complaints', upload.array('photos', 3), (req, res) => {
  const body = req.body || {};
  const text = String(body.complaintText || '').trim();
  if (text.length < 8 || text.length > 1000) return res.status(400).json({ success: false, error: 'Please describe the problem in 8 to 1000 characters.' });
  const orderId = body.orderId ? String(body.orderId).trim() : null;
  if (orderId && !/^[A-Za-z0-9_-]{1,50}$/.test(orderId)) return res.status(400).json({ success: false, error: 'Invalid order.' });
  const issueKey = body.issueKey ? String(body.issueKey).replace(/[^a-z_]/gi, '').slice(0, 30) : null;
  const out = complaints.register({ customerId: req.customer.id, orderId, issueKey, text, files: req.files || [] });
  if (out.status !== 201) return res.status(out.status).json({ success: false, error: out.error });
  res.status(201).json({ success: true, data: { id: out.id, status: 'registered', message: 'Sorry for the inconvenience. Your complaint has been registered successfully. We have also sent a confirmation to your email.' } });
});

module.exports = router;
