const db = require('../db/connection');
const audit = require('./auditService');
const { createTicket } = require('./actionExecutor');

function applyOverride({ auditId, type, reason, actorName, actorEmail }) {
  const entry = audit.get(auditId);
  if (!entry) return { status: 404, error: 'Audit entry not found' };
  if (entry.entryType !== 'DECISION') return { status: 400, error: 'Only AI decision entries can be overridden' };
  if (audit.overridesFor(auditId).length > 0) return { status: 409, error: 'This decision was already overridden' };

  const actions = entry.actions || {};
  const changes = { refundCancelled: null, ticketReopened: null, ticketCreated: null };
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
    } else {
      const t = createTicket({
        customerId: entry.customerId, category: 'general', status: 'open',
        subject: `Admin escalation: audit #${auditId}`,
        notes: `Escalated by ${actorName} (${actorEmail}). Reason: ${reason}`,
      });
      changes.ticketCreated = t.id;
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
    decision: type === 'UNDO' ? 'OVERRIDE_UNDO' : 'OVERRIDE_ESCALATE',
    reasoning: reason,
    evidence: { originalDecision: entry.decision },
    actions: changes,
  });
  return { status: 200, overrideAuditId, changes };
}

module.exports = { applyOverride };
