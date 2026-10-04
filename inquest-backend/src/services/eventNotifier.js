const notifications = require('./notificationService');
const caseService = require('./caseService');

const trim = (s, n) => (s && String(s).length > n ? String(s).slice(0, n - 1) + '…' : s || '');
const IMPORTANT = ['resolved', 'awaiting_you'];

// Legacy/agent-console path: tells admins what the AI did. The customer only hears about outcomes that matter.
function notifyCase(auditId) {
  try {
    const c = caseService.getCase(auditId);
    if (!c) return;
    const who = (c.customerName || c.customerId) + (c.orderId ? ' · ' + c.orderId : '');

    if (c.status === 'needs_attention') {
      notifications.notify({ audience: 'admin', type: 'ESCALATION', severity: 'attention', refId: c.id, title: 'Needs review: ' + who, body: (c.policy || 'No policy') + ': ' + trim(c.reasoning, 160) });
    } else if (c.status === 'auto_resolved') {
      notifications.notify({ audience: 'admin', type: 'AUTO_RESOLVED', severity: 'info', refId: c.id, title: 'AI resolved: ' + who, body: c.detail });
    } else if (c.status === 'answered') {
      notifications.notify({ audience: 'admin', type: 'AUTO_ANSWERED', severity: 'info', refId: c.id, title: 'AI answered a query: ' + who, body: c.detail });
    } else if (c.status === 'awaiting_customer') {
      notifications.notify({ audience: 'admin', type: 'AWAITING_CUSTOMER', severity: 'info', refId: c.id, title: 'Waiting for customer: ' + who, body: 'An offer was sent to the customer.' });
    }
    if (c.risk && c.risk.level === 'HIGH') {
      notifications.notify({ audience: 'admin', type: 'FRAUD_FLAG', severity: 'attention', refId: c.id, title: 'High-risk customer: ' + who, body: 'Risk score ' + c.risk.score + '/100.' });
    }
    if (c.photo && c.photo.reused) {
      notifications.notify({ audience: 'admin', type: 'FRAUD_FLAG', severity: 'attention', refId: c.id, title: 'Photo reuse detected: ' + who, body: 'The same image was submitted before.' });
    }
    if (IMPORTANT.includes(c.customerStatus)) {
      notifications.notify({
        audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', refId: c.id, dedupeKey: 'case:' + c.id + ':' + c.customerStatus,
        severity: c.customerStatus === 'resolved' ? 'success' : 'attention',
        title: 'Complaint #' + (c.complaintId || c.id) + ': ' + c.customerLabel, body: c.customerDetail,
      });
    }
  } catch (err) {
    console.error('[eventNotifier] notifyCase failed:', err.message);
  }
}

// After a customer answers an offer, or staff overrides/resolves a case. One notification per real outcome.
function notifyCaseUpdate(auditId, kind) {
  try {
    const c = caseService.getCase(auditId);
    if (!c) return;
    const who = (c.customerName || c.customerId) + (c.orderId ? ' · ' + c.orderId : '');
    if (kind === 'CUSTOMER_RESPONSE') {
      notifications.notify({ audience: 'admin', type: 'CUSTOMER_RESPONSE', severity: 'info', refId: c.id, dedupeKey: 'resp:' + c.id, title: 'Customer responded: ' + who, body: c.detail });
    }
    if (IMPORTANT.includes(c.customerStatus)) {
      const fresh = notifications.notify({
        audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', refId: c.id, dedupeKey: 'case:' + c.id + ':' + c.customerStatus,
        severity: c.customerStatus === 'resolved' ? 'success' : 'attention',
        title: 'Complaint #' + (c.complaintId || c.id) + ': ' + c.customerLabel, body: c.customerDetail,
      });
      if (fresh) {
        require('./emailService').sendToCustomer(c.customerId, 'Complaint #' + (c.complaintId || c.id) + ': ' + c.customerLabel, c.customerDetail);
      }
    }
  } catch (err) {
    console.error('[eventNotifier] notifyCaseUpdate failed:', err.message);
  }
}

module.exports = { notifyCase, notifyCaseUpdate };
