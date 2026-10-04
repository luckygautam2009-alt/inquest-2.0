const config = require('../config/env');
const adminSessions = require('../services/adminSessionService');

// Admin access: either a session token (X-Admin-Token, issued after admin sign-in)
// or, for scripts and older screens, the admin password in the request body.
function requireAdminPassword(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token) {
    const session = adminSessions.verify(String(token));
    if (!session) return res.status(401).json({ success: false, error: 'Admin session expired. Please sign in again.' });
    req.admin = session;
    return next();
  }
  const provided = req.body && req.body.adminPassword;
  if (!config.adminPassword) {
    return res.status(500).json({ success: false, error: 'Admin password not configured on server' });
  }
  if (!provided || provided !== config.adminPassword) {
    return res.status(401).json({ success: false, error: 'Invalid or missing admin password' });
  }
  req.admin = { name: (req.body && req.body.employeeName) || 'Admin', email: (req.body && req.body.employeeEmail) || 'admin@inquest.local' };
  next();
}

module.exports = { requireAdminPassword };
