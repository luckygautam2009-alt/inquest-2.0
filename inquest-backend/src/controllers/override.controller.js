const { applyOverride } = require('../services/overrideService');
const { getAnalytics } = require('../services/analyticsService');

function overrideDecision(req, res) {
  const { auditId, type, reason, employeeName, employeeEmail } = req.body || {};
  const id = Number(auditId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'auditId must be a positive integer' });
  if (!['UNDO', 'ESCALATE'].includes(type)) return res.status(400).json({ success: false, error: 'type must be UNDO or ESCALATE' });
  const why = String(reason || '').trim();
  if (why.length < 5 || why.length > 500) return res.status(400).json({ success: false, error: 'reason must be 5-500 characters' });
  const name = String(employeeName || '').trim();
  const email = String(employeeEmail || '').trim().toLowerCase();
  if (!name || name.length > 80) return res.status(400).json({ success: false, error: 'employeeName is required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ success: false, error: 'valid employeeEmail is required' });

  const out = applyOverride({ auditId: id, type, reason: why, actorName: name, actorEmail: email });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: { overrideAuditId: out.overrideAuditId, changes: out.changes } });
}

function analytics(req, res) {
  res.status(200).json({ success: true, data: getAnalytics() });
}

module.exports = { overrideDecision, analytics };
