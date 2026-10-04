const { applyOverride } = require('../services/overrideService');
const { getAnalytics } = require('../services/analyticsService');
const caseService = require('../services/caseService');
const notifications = require('../services/notificationService');

function overrideDecision(req, res) {
  const { auditId, type, reason, employeeName, employeeEmail, resolution, amount, customerMessage } = req.body || {};
  const id = Number(auditId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'auditId must be a positive integer' });
  if (!['UNDO', 'ESCALATE', 'RESOLVE'].includes(type)) return res.status(400).json({ success: false, error: 'type must be UNDO, ESCALATE or RESOLVE' });
  const why = String(reason || '').trim();
  if (why.length < 5 || why.length > 500) return res.status(400).json({ success: false, error: 'reason must be 5-500 characters' });
  const name = String((req.admin && req.admin.name) || employeeName || '').trim();
  const email = String((req.admin && req.admin.email) || employeeEmail || '').trim().toLowerCase();
  if (!name || name.length > 80) return res.status(400).json({ success: false, error: 'employeeName is required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ success: false, error: 'valid employeeEmail is required' });

  let res2 = null;
  let msg = null;
  if (type === 'RESOLVE') {
    res2 = String(resolution || '');
    if (!['REFUND', 'NO_REFUND'].includes(res2)) return res.status(400).json({ success: false, error: 'resolution must be REFUND or NO_REFUND' });
    msg = String(customerMessage || '').trim().slice(0, 300) || null;
  }

  const out = applyOverride({ auditId: id, type, reason: why, actorName: name, actorEmail: email, resolution: res2, amount, customerMessage: msg });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: { overrideAuditId: out.overrideAuditId, changes: out.changes } });
}

function analytics(req, res) {
  res.status(200).json({ success: true, data: getAnalytics() });
}

function listCases(req, res) {
  const { status, customerId, limit } = req.body || {};
  const all = caseService.buildCases({ customerId: customerId ? String(customerId) : null, limit: Math.min(Number(limit) || 500, 1000) });
  const counts = caseService.countByStatus(all);
  const wanted = status === 'attention' ? 'needs_attention' : status;
  const cases = wanted && wanted !== 'all' ? all.filter((c) => c.status === wanted) : all;
  res.status(200).json({ success: true, data: { cases, counts } });
}

function adminNotifications(req, res) {
  const { markRead, limit } = req.body || {};
  if (markRead === 'all') notifications.markRead({ audience: 'admin' });
  else if (Array.isArray(markRead)) notifications.markRead({ audience: 'admin', ids: markRead });
  const all = caseService.buildCases({ limit: 1000 });
  res.status(200).json({
    success: true,
    data: {
      notifications: notifications.list({ audience: 'admin', limit: Math.min(Number(limit) || 40, 100) }),
      unread: notifications.unreadCount({ audience: 'admin' }),
      needsAttention: all.filter((c) => c.status === 'needs_attention').length,
    },
  });
}

module.exports = { overrideDecision, analytics, listCases, adminNotifications };
