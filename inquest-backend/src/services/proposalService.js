const db = require('../db/connection');
const audit = require('./auditService');
const { createRefund, createTicket } = require('./actionExecutor');

db.exec(`
  CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auditId INTEGER NOT NULL UNIQUE,
    customerId TEXT NOT NULL,
    orderId TEXT,
    policy TEXT,
    type TEXT NOT NULL,
    options TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_customer',
    choice TEXT,
    createdAt TEXT NOT NULL,
    resolvedAt TEXT
  );
`);

const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const DECLINE = { key: 'DECLINE', label: 'No thanks' };

function createProposal({ auditId, customerId, decision, rootCause, investigation }) {
  if (!auditId || !decision || decision.decision !== 'CUSTOMER_CONFIRM') return null;
  const policy = rootCause && rootCause.matchedPolicy ? rootCause.matchedPolicy : null;
  const order = investigation && investigation.focusOrder ? investigation.focusOrder : null;
  let type; let summary; let options;

  if (policy === 'POLICY11' && order) {
    const credit = Math.max(25, Math.min(200, Math.round(order.amount * 0.05)));
    type = 'DELAY_COMPENSATION';
    summary = `Your order ${order.id} is running late. Choose how we should make it right:`;
    options = [
      { key: 'CREDIT', label: `Take a ₹${credit} shipping credit`, amount: credit },
      { key: 'EXPEDITE', label: 'Expedite my delivery' },
      DECLINE,
    ];
  } else if ((policy === 'POLICY3' || policy === 'POLICY6') && order) {
    type = policy === 'POLICY3' ? 'RETURN_PICKUP' : 'REVERSE_PICKUP';
    summary = policy === 'POLICY3'
      ? `Order ${order.id} is eligible for return. Shall we schedule a pickup?`
      : `We could not fully verify the damage from the photo. Shall we arrange a pickup of order ${order.id} for inspection?`;
    options = [{ key: 'SCHEDULE_PICKUP', label: 'Yes, schedule a pickup' }, DECLINE];
  } else {
    type = 'GENERIC';
    summary = 'We found a resolution under our policy. Shall we proceed?';
    options = [{ key: 'CONFIRM', label: 'Yes, proceed' }, DECLINE];
  }

  try {
    db.prepare(`INSERT INTO proposals (auditId, customerId, orderId, policy, type, options, status, createdAt)
      VALUES (?,?,?,?,?,?, 'awaiting_customer', ?)`)
      .run(auditId, customerId, order ? order.id : null, policy, type, JSON.stringify(options), new Date().toISOString());
  } catch (err) {
    console.error('[proposal] failed to store proposal:', err.message);
    return null;
  }
  return { auditId, customerId, orderId: order ? order.id : null, type, summary, options, status: 'awaiting_customer' };
}

function respond({ auditId, customerId, choice }) {
  const p = db.prepare('SELECT * FROM proposals WHERE auditId=?').get(auditId);
  if (!p || p.customerId !== customerId) return { status: 404, error: 'No pending confirmation found' };
  if (p.status !== 'awaiting_customer') return { status: 409, error: 'This confirmation was already answered' };
  const opt = JSON.parse(p.options).find((o) => o.key === choice);
  if (!opt) return { status: 400, error: 'Invalid choice' };

  const orig = audit.get(auditId);
  const changes = { refund: null, ticket: null, orderUpdate: null };
  const now = new Date().toISOString();
  let message = '';
  let failure = null;

  db.transaction(() => {
    if (choice === 'DECLINE') {
      message = 'No problem. No changes were made to your order.';
    } else if (choice === 'CREDIT') {
      const dup = db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE orderId=? AND customerId=? AND reason LIKE 'Shipping credit%' AND status != 'cancelled'").get(p.orderId, customerId).n;
      if (dup) { failure = { status: 409, error: 'A shipping credit was already issued for this order' }; return; }
      const r = createRefund({ orderId: p.orderId, customerId, amount: opt.amount, reason: 'Shipping credit for delayed delivery (POLICY11)', gatewayRef: null });
      changes.refund = { id: r.id, amount: r.amount, status: r.status };
      const t = createTicket({ customerId, category: 'delivery', status: 'resolved', subject: `Delay compensation accepted: ${p.orderId}`, resolution: `Shipping credit ${r.id} of INR ${opt.amount} issued`, notes: 'Customer accepted shipping credit' });
      changes.ticket = { id: t.id, status: t.status };
      message = `Done. A shipping credit of ₹${opt.amount} has been issued (${r.id}).`;
    } else if (choice === 'EXPEDITE') {
      db.prepare("UPDATE orders SET courierStatus='expedited', estimatedDelivery=? WHERE id=? AND customerId=?").run(day(1), p.orderId, customerId);
      changes.orderUpdate = { courierStatus: 'expedited', estimatedDelivery: day(1) };
      const t = createTicket({ customerId, category: 'delivery', status: 'open', subject: `Expedite delivery: ${p.orderId}`, notes: 'Customer chose expedited delivery for delayed order' });
      changes.ticket = { id: t.id, status: t.status };
      message = 'Done. We have expedited your delivery. New expected date: tomorrow.';
    } else if (choice === 'SCHEDULE_PICKUP') {
      db.prepare("UPDATE orders SET returnRequested=1, returnStatus='pickup_scheduled' WHERE id=? AND customerId=?").run(p.orderId, customerId);
      changes.orderUpdate = { returnStatus: 'pickup_scheduled' };
      const t = createTicket({ customerId, category: 'refund', status: 'open', subject: `Pickup scheduled: ${p.orderId}`, notes: 'Customer confirmed pickup; refund after warehouse inspection' });
      changes.ticket = { id: t.id, status: t.status };
      message = 'Done. A pickup has been scheduled. Your refund follows once the item is inspected.';
    } else {
      const t = createTicket({ customerId, category: 'general', status: 'resolved', subject: `Customer confirmed: ${p.policy || 'policy'} | ${p.orderId || 'N/A'}`, resolution: 'Customer approved the proposed resolution', notes: 'Approved via confirmation' });
      changes.ticket = { id: t.id, status: t.status };
      message = 'Thanks, your confirmation has been recorded.';
    }
    db.prepare('UPDATE proposals SET status=?, choice=?, resolvedAt=? WHERE auditId=?')
      .run(choice === 'DECLINE' ? 'declined' : 'accepted', choice, now, auditId);
  })();

  if (failure) return failure;

  audit.append({
    entryType: 'CUSTOMER_RESPONSE',
    actor: `customer:${customerId}`,
    customerId,
    refId: auditId,
    complaintText: orig ? orig.complaintText : null,
    intent: orig ? orig.intent : null,
    matchedPolicy: p.policy,
    decision: choice === 'DECLINE' ? 'CUSTOMER_DECLINED' : 'CUSTOMER_ACCEPTED',
    reasoning: `Customer chose "${opt.label}"`,
    evidence: { originalDecision: 'CUSTOMER_CONFIRM', choice },
    actions: changes,
  });
  return { status: 200, message, changes };
}

module.exports = { createProposal, respond };
