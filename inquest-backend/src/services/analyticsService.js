const db = require('../db/connection');
const audit = require('./auditService');
const { listRisk } = require('./riskEngine');

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function getAnalytics() {
  const rows = audit.list(5000);
  const decisions = rows.filter((r) => r.entryType === 'DECISION');
  const overrides = rows.filter((r) => r.entryType === 'OVERRIDE');
  const count = (d) => decisions.filter((r) => r.decision === d).length;

  const auto = count('AUTO_RESOLVE');
  const confirm = count('CUSTOMER_CONFIRM');
  const human = count('HUMAN_ESCALATION');
  const total = decisions.length;
  const confs = decisions.map((r) => r.confidence).filter((c) => typeof c === 'number');

  const withPhoto = decisions.filter((r) => r.evidence && r.evidence.photo && r.evidence.photo.provided);
  const undone = overrides.filter((r) => r.decision === 'OVERRIDE_UNDO').length;

  const byPolicy = {};
  decisions.forEach((r) => { const k = r.matchedPolicy || 'none'; byPolicy[k] = (byPolicy[k] || 0) + 1; });

  const refunds = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM refunds WHERE id LIKE 'RFD%' AND status != 'cancelled'").get();
  const cancelled = db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE id LIKE 'RFD%' AND status = 'cancelled'").get().n;

  return {
    totals: { decisions: total, autoResolved: auto, customerConfirm: confirm, humanEscalation: human },
    rates: { autoResolvePct: pct(auto, total), escalationPct: pct(human, total) },
    avgConfidence: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0,
    fraudSignals: {
      highRiskEscalations: decisions.filter((r) => r.evidence && r.evidence.risk && r.evidence.risk.level === 'HIGH' && r.decision === 'HUMAN_ESCALATION').length,
      photoClaims: withPhoto.length,
      photoAutoResolved: withPhoto.filter((r) => r.decision === 'AUTO_RESOLVE').length,
      imageReuseHits: withPhoto.filter((r) => r.evidence.photo.reuse && r.evidence.photo.reuse.detected).length,
    },
    actions: { refundsInitiated: refunds.n, refundValueInr: refunds.total, refundsCancelledByOverride: cancelled },
    overrides: { total: overrides.length, undo: undone, escalate: overrides.filter((r) => r.decision === 'OVERRIDE_ESCALATE').length, resolved: overrides.filter((r) => r.decision === 'OVERRIDE_RESOLVE').length, undoRateOfAutoResolvePct: pct(undone, auto) },
    byPolicy,
    suspiciousCustomers: listRisk().filter((c) => c.score >= 30).slice(0, 5)
      .map((c) => ({ customerId: c.customerId, name: c.name, score: c.score, level: c.level })),
    recent: decisions.slice(0, 8).map((r) => ({ auditId: r.id, ts: r.ts, customerId: r.customerId, decision: r.decision, policy: r.matchedPolicy })),
  };
}

module.exports = { getAnalytics };
