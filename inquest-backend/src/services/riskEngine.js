const db = require('../db/connection');

const HIGH = Number(process.env.RISK_HIGH_THRESHOLD) || 60;
const MEDIUM = 30;
const DAY = 86400000;
// Refunds caused by OUR errors (payment glitches, cancellations) are not customer-abuse signals
const SYSTEM_REASON = /duplicate|reconciliation|cancel|shipping credit/i;
const CLAIM_SUBJECT = /not received|not arrived|damag|wrong item|missing|torn|broken|defect/i;

const daysAgo = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / DAY;
};

function computeRisk(customerId) {
  const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(customerId);
  if (!customer) return null;

  const orders = db.prepare('SELECT amount FROM orders WHERE customerId=?').all(customerId);
  const refunds = db.prepare("SELECT amount, reason, initiatedAt FROM refunds WHERE customerId=? AND status != 'cancelled'")
    .all(customerId).filter((r) => !SYSTEM_REASON.test(r.reason || ''));
  const tickets = db.prepare('SELECT category, subject, status, date FROM tickets WHERE customerId=?').all(customerId);
  const flagged = db.prepare('SELECT COUNT(*) AS n FROM security_events WHERE customerId=? AND flagged=1').get(customerId).n;

  const signals = [];
  const add = (name, points, detail) => { if (points !== 0) signals.push({ name, points, detail }); };

  const recent = refunds.filter((r) => daysAgo(r.initiatedAt) <= 90).length;
  add('refund_frequency', [0, 5, 15, 25, 35][Math.min(recent, 4)], `${recent} customer-claim refund(s) in last 90 days`);

  const orderTotal = orders.reduce((s, o) => s + (o.amount || 0), 0);
  const refundTotal = refunds.reduce((s, r) => s + (r.amount || 0), 0);
  const ratio = orderTotal > 0 ? refundTotal / orderTotal : 0;
  add('refunded_value_ratio', ratio > 0.5 ? 20 : ratio > 0.25 ? 10 : 0, `${Math.round(ratio * 100)}% of order value refunded`);

  const claims = tickets.filter((t) => daysAgo(t.date) <= 180 && (t.category === 'product' || CLAIM_SUBJECT.test(t.subject || ''))).length;
  add('repeated_claims', claims >= 3 ? 20 : claims === 2 ? 10 : 0, `${claims} damage/not-received/wrong-item claim(s) in last 180 days`);

  add('flagged_security_events', flagged > 0 ? 15 : 0, `${flagged} flagged security event(s)`);
  const openSec = tickets.filter((t) => t.category === 'security' && t.status === 'open').length;
  add('open_security_ticket', openSec > 0 ? 10 : 0, `${openSec} open security ticket(s)`);

  const age = daysAgo(customer.joinedOn || customer.joinedDate);
  add('new_account', age < 30 ? 10 : age < 90 ? 5 : 0, `account age ${Math.floor(age)} days`);
  add('tier_trust', customer.tier === 'platinum' ? -10 : customer.tier === 'gold' ? -5 : 0, `${customer.tier} tier`);

  const score = Math.max(0, Math.min(100, signals.reduce((s, x) => s + x.points, 0)));
  const level = score >= HIGH ? 'HIGH' : score >= MEDIUM ? 'MEDIUM' : 'LOW';
  return { customerId, score, level, highThreshold: HIGH, signals };
}

function listRisk() {
  return db.prepare('SELECT id, name, tier FROM customers').all()
    .map((c) => ({ name: c.name, tier: c.tier, ...computeRisk(c.id) }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { computeRisk, listRisk };
