const audit = require('../services/auditService');

function getAuditLog(req, res) {
  const limit = Math.min(Number(req.body?.limit) || 100, 500);
  res.status(200).json({ success: true, data: { entries: audit.list(limit), chain: audit.verifyChain() } });
}

module.exports = { getAuditLog };
