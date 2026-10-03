const { respond } = require('../services/proposalService');
const ID_RE = /^[A-Za-z0-9_-]{1,50}$/;

function confirmProposal(req, res) {
  const { auditId, customerId, choice } = req.body || {};
  const id = Number(auditId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'auditId must be a positive integer' });
  if (!ID_RE.test(String(customerId || ''))) return res.status(400).json({ success: false, error: 'valid customerId is required' });
  if (!/^[A-Z_]{3,20}$/.test(String(choice || ''))) return res.status(400).json({ success: false, error: 'invalid choice' });
  const out = respond({ auditId: id, customerId, choice });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: { message: out.message, changes: out.changes } });
}

module.exports = { confirmProposal };
