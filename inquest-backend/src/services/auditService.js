const crypto = require('crypto');
const db = require('../db/connection');

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    entryType TEXT NOT NULL DEFAULT 'DECISION',
    actor TEXT NOT NULL DEFAULT 'AI',
    customerId TEXT,
    refId INTEGER,
    complaintText TEXT,
    intent TEXT,
    matchedPolicy TEXT,
    decision TEXT,
    confidence REAL,
    reasoning TEXT,
    evidence TEXT,
    actions TEXT,
    prevHash TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`);

const FIELDS = ['ts', 'entryType', 'actor', 'customerId', 'refId', 'complaintText', 'intent',
  'matchedPolicy', 'decision', 'confidence', 'reasoning', 'evidence', 'actions'];

function computeHash(prevHash, row) {
  const payload = {};
  FIELDS.forEach((f) => { payload[f] = row[f] ?? null; });
  return crypto.createHash('sha256').update(prevHash + JSON.stringify(payload)).digest('hex');
}

const insertStmt = db.prepare(`
  INSERT INTO audit_log (ts, entryType, actor, customerId, refId, complaintText, intent,
    matchedPolicy, decision, confidence, reasoning, evidence, actions, prevHash, hash)
  VALUES (@ts, @entryType, @actor, @customerId, @refId, @complaintText, @intent,
    @matchedPolicy, @decision, @confidence, @reasoning, @evidence, @actions, @prevHash, @hash)
`);

const append = db.transaction((entry) => {
  const last = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  const prevHash = last ? last.hash : 'GENESIS';
  const row = {
    ts: new Date().toISOString(),
    entryType: 'DECISION',
    actor: 'AI',
    customerId: null, refId: null, complaintText: null, intent: null,
    matchedPolicy: null, decision: null, confidence: null, reasoning: null,
    ...entry,
    evidence: entry.evidence ? JSON.stringify(entry.evidence) : null,
    actions: entry.actions ? JSON.stringify(entry.actions) : null,
  };
  row.prevHash = prevHash;
  row.hash = computeHash(prevHash, row);
  return Number(insertStmt.run(row).lastInsertRowid);
});

function logDecision({ customerId, complaintText, analysis, rootCause, decision, investigation, actions, risk, photo, extra }) {
  try {
    return append({
      customerId,
      complaintText,
      intent: analysis?.intent || null,
      matchedPolicy: rootCause?.matchedPolicy || null,
      decision: decision?.decision,
      confidence: decision?.confidence ?? null,
      reasoning: decision?.reasoning || null,
      evidence: {
        orderId: investigation?.focusOrder?.id || null,
        orderVerified: !!investigation?.orderVerified,
        orderMismatch: !!investigation?.orderMismatch,
        sentiment: analysis?.sentiment || null,
        risk: risk ? { score: risk.score, level: risk.level, signals: risk.signals } : null,
        photo: photo && photo.provided ? { provided: photo.provided, hashes: photo.hashes, reuse: photo.reuse, analyzed: !!photo.analyzed, vision: photo.vision || null, error: photo.error || null } : null,
        payments: (investigation?.focusPayments || []).map((p) => ({
          id: p.id, amount: p.amount, gatewayStatus: p.gatewayStatus, localStatus: p.localStatus,
        })),
        refunds: (investigation?.focusRefunds || []).map((r) => ({
          id: r.id, amount: r.amount, status: r.status,
        })),
        ...(extra || {}),
      },
      actions: actions || null,
    });
  } catch (err) {
    console.error('[audit] Failed to write audit entry:', err.message);
    return null;
  }
}

function list(limit = 100) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit).map((r) => ({
    ...r,
    evidence: r.evidence ? JSON.parse(r.evidence) : null,
    actions: r.actions ? JSON.parse(r.actions) : null,
  }));
}

function verifyChain() {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
  let prev = 'GENESIS';
  for (const r of rows) {
    if (r.prevHash !== prev || computeHash(prev, r) !== r.hash) {
      return { valid: false, brokenAtId: r.id, total: rows.length };
    }
    prev = r.hash;
  }
  return { valid: true, total: rows.length };
}

function get(id) {
  const r = db.prepare('SELECT * FROM audit_log WHERE id=?').get(id);
  if (!r) return null;
  return { ...r, evidence: r.evidence ? JSON.parse(r.evidence) : null, actions: r.actions ? JSON.parse(r.actions) : null };
}

function overridesFor(refId) {
  return db.prepare("SELECT id FROM audit_log WHERE entryType='OVERRIDE' AND refId=?").all(refId);
}

module.exports = { logDecision, append, list, verifyChain, get, overridesFor };
