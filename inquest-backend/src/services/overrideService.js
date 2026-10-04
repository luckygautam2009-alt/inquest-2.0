const db = require('../db/connection');
const audit = require('./auditService');
const caseService = require('./caseService');
const { createTicket, createRefund } = require('./actionExecutor');
const { notifyCaseUpdate } = require('./eventNotifier');

const DECISION_NAME = { UNDO: 'OVERRIDE_UNDO', ESCALATE: 'OVERRIDE_ESCALATE', RESOLVE: 'OVERRIDE_RESOLVE' };

function applyOverride({ auditId, type, reason, actorName, actorEmail, resolution, amount, customerMessage }) {
  const entry = audit.get(auditId);
  if (!entry) return { status: 404, error: 'Audit entry not found' };
  if (entry.entryType !== 'DECISION') return { status: 400, error: 'Only AI decision entries can be overridden' };

  const existing = db.prepare("SELECT decision FROM audit_log WHERE entryType='OVERRIDE' AND refId=?").all(auditId).map((r) => r.decision);
  if (existing.includes('OVERRIDE_RESOLVE')) return { status: 409, error: 'This case was already resolved by staff' };
  const decisionName = DECISION_NAME[type];
  if (existing.includes(decisionName)) return { status: 409, error: 'This decision was already overridden' };

  const actions = entry.actions || {};
  const changes = { refundCancelled: null, ticketReopened: null, ticketCreated: null, refund: null, ticket: null };
  const now = new Date().toISOString();
  let failure = null;

  db.transaction(() => {
    if (type === 'UNDO') {
      const hasTicket = actions.ticket && !actions.ticket.reused;
      if (!actions.refund && !hasTicket) { failure = { status: 400, error: 'Nothing to undo: the AI took no action on this decision' }; return; }
      if (actions.refund) {
        const r = db.prepare('SELECT * FROM refunds WHERE id=?').get(actions.refund.id);
        if (!r) { failure = { status: 409, error: `Refund ${actions.refund.id} no longer exists` }; return; }
        if (r.status !== 'pending') { failure = { status: 409, error: `Refund ${r.id} is already "${r.status}" and cannot be undone here` }; return; }
        db.prepare("UPDATE refunds SET status='cancelled', completedAt=? WHERE id=?").run(now, r.id);
        changes.refundCancelled = r.id;
      }
      if (hasTicket) {
        db.prepare("UPDATE tickets SET status='open', resolvedOn=NULL, resolution=NULL, notes=COALESCE(notes,'') || ? WHERE id=?")
          .run(` | Reopened by admin override (audit #${auditId})`, actions.ticket.id);
        changes.ticketReopened = actions.ticket.id;
      }
    } else if (type === 'ESCALATE') {
      const t = createTicket({
        customerId: entry.customerId, category: 'general', status: 'open',
        subject: `Admin escalation: audit #${auditId}`,
        notes: `Escalated by ${actorName} (${actorEmail}). Reason: ${reason}`,
      });
      changes.ticketCreated = t.id;
    } else {
      const c = caseService.getCase(auditId);
      if (!c || !['needs_attention', 'pending_confirmation'].includes(c.status)) { failure = { status: 409, error: 'Only cases that need attention can be resolved' }; return; }
      if (resolution === 'REFUND') {
        const orderId = entry.evidence && entry.evidence.orderId;
        const order = orderId ? db.prepare('SELECT * FROM orders WHERE id=? AND customerId=?').get(orderId, entry.customerId) : null;
        if (!order) { failure = { status: 409, error: 'This case has no verified order, so a refund cannot be issued. Close it without a refund instead.' }; return; }
        const amt = amount === undefined || amount === null || amount === '' ? order.amount : Number(amount);
        if (!(amt > 0) || amt > order.amount) { failure = { status: 400, error: `Refund amount must be between 1 and ${order.amount}` }; return; }
        const already = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM refunds WHERE orderId=? AND customerId=? AND status != 'cancelled'").get(order.id, entry.customerId).total;
        if (already + amt > order.amount) { failure = { status: 409, error: `Refunds on this order (${already} already issued) would exceed its value of ${order.amount}` }; return; }
        const r = createRefund({ orderId: order.id, customerId: entry.customerId, amount: amt, reason: `Refund approved by staff (case #${auditId})`, gatewayRef: null });
        changes.refund = { id: r.id, amount: r.amount, status: r.status };
      }
      const t = createTicket({
        customerId: entry.customerId, category: 'general', status: 'resolved',
        subject: `Resolved by staff: case #${auditId}`,
        resolution: changes.refund ? `Refund ${changes.refund.id} of INR ${changes.refund.amount} approved` : 'Closed without a refund',
        notes: `By ${actorName} (${actorEmail}). ${reason}`,
      });
      changes.ticket = { id: t.id, status: t.status };
    }
  })();

  if (failure) return failure;

  const overrideAuditId = audit.append({
    entryType: 'OVERRIDE',
    actor: `${actorName} <${actorEmail}>`,
    customerId: entry.customerId,
    refId: auditId,
    complaintText: entry.complaintText,
    intent: entry.intent,
    matchedPolicy: entry.matchedPolicy,
    decision: decisionName,
    reasoning: reason,
    evidence: { originalDecision: entry.decision, resolution: resolution || null, customerMessage: customerMessage || null },
    actions: changes,
  });
  notifyCaseUpdate(auditId, decisionName);
  return { status: 200, overrideAuditId, changes };
}

module.exports = { applyOverride };
