const notifications = require('./notificationService');
const caseService = require('./caseService');

const trim = (s, n) => (s && String(s).length > n ? String(s).slice(0, n - 1) + '…' : s || '');

// Called right after the AI decides: tells the admins what happened and the customer where they stand
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

    notifications.notify({
      audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', refId: c.id,
      severity: c.customerStatus === 'resolved' ? 'success' : c.customerStatus === 'awaiting_you' ? 'attention' : 'info',
      title: 'Complaint #' + c.id + ': ' + c.customerLabel, body: c.customerDetail,
    });
  } catch (err) {
    console.error('[eventNotifier] notifyCase failed:', err.message);
  }
}

// Called after a customer answers an offer, or staff overrides/resolves a case
function notifyCaseUpdate(auditId, kind) {
  try {
    const c = caseService.getCase(auditId);
    if (!c) return;
    const who = (c.customerName || c.customerId) + (c.orderId ? ' · ' + c.orderId : '');
    if (kind === 'CUSTOMER_RESPONSE') {
      notifications.notify({ audience: 'admin', type: 'CUSTOMER_RESPONSE', severity: 'info', refId: c.id, title: 'Customer responded: ' + who, body: c.detail });
    }
    notifications.notify({
      audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', refId: c.id,
      severity: c.customerStatus === 'resolved' ? 'success' : 'info',
      title: 'Complaint #' + c.id + ': ' + c.customerLabel, body: c.customerDetail,
    });
    if (['resolved', 'awaiting_you'].includes(c.customerStatus)) {
      require('./emailService').sendToCustomer(c.customerId, 'Complaint #' + c.id + ': ' + c.customerLabel, c.customerDetail);
    }
  } catch (err) {
    console.error('[eventNotifier] notifyCaseUpdate failed:', err.message);
  }
}

module.exports = { notifyCase, notifyCaseUpdate };
