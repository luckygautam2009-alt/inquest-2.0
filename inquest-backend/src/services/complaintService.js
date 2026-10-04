const db = require('../db/connection');
const caseService = require('./caseService');
const notifications = require('./notificationService');
const emailService = require('./emailService');
const overrideService = require('./overrideService');
const audit = require('./auditService');
const { executeActions } = require('./actionExecutor');
const { createProposal } = require('./proposalService');
const { runInvestigation } = require('./investigationRunner');
const { notifyCaseUpdate } = require('./eventNotifier');

db.exec(`
  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerId TEXT NOT NULL,
    orderId TEXT,
    issueKey TEXT,
    complaintText TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'registered',
    createdAt TEXT NOT NULL,
    investigatedAt TEXT,
    resolvedAt TEXT,
    resolvedBy TEXT,
    auditId INTEGER,
    investigation TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_complaints_customer ON complaints(customerId);
  CREATE TABLE IF NOT EXISTS complaint_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaintId INTEGER NOT NULL,
    mime TEXT NOT NULL,
    name TEXT,
    size INTEGER,
    data BLOB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_complaint_files_complaint ON complaint_files(complaintId);
`);

const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const REGISTERED = { status: 'registered', label: 'Registered', detail: 'We have received your complaint. Our team will review it shortly.' };

function customerStatusFor(c) {
  if (!c.auditId) return REGISTERED;
  const k = caseService.getCase(c.auditId);
  if (!k) return REGISTERED;
  return { status: k.customerStatus, label: k.customerLabel, detail: k.customerDetail, proposal: k.proposal || undefined };
}

// ---------- customer ----------
function register({ customerId, orderId, issueKey, text, files }) {
  const customer = db.prepare('SELECT id, name, email FROM customers WHERE id=?').get(customerId);
  if (!customer) return { status: 404, error: 'Customer not found' };
  let order = null;
  if (orderId) {
    order = db.prepare('SELECT id, product FROM orders WHERE id=? AND customerId=?').get(orderId, customerId);
    if (!order) return { status: 400, error: 'That order does not belong to your account' };
  }
  const finalText = order && !text.includes(order.id) ? `order ${order.id}: ${text}` : text;
  let id;
  db.transaction(() => {
    id = Number(db.prepare('INSERT INTO complaints (customerId, orderId, issueKey, complaintText, status, createdAt) VALUES (?,?,?,?,?,?)')
      .run(customerId, order ? order.id : null, issueKey || null, finalText, 'registered', new Date().toISOString()).lastInsertRowid);
    for (const f of files) {
      db.prepare('INSERT INTO complaint_files (complaintId, mime, name, size, data) VALUES (?,?,?,?,?)')
        .run(id, f.mimetype, String(f.originalname || 'photo').slice(0, 120), f.size || f.buffer.length, f.buffer);
    }
  })();

  const where = `${customer.name || customerId}${order ? ' · ' + order.id : ''}`;
  notifications.notify({ audience: 'admin', type: 'NEW_COMPLAINT', severity: 'attention', refId: id, title: `New complaint #${id}: ${where}`, body: finalText.slice(0, 160) });
  notifications.notify({ audience: 'customer', customerId, type: 'COMPLAINT_UPDATE', severity: 'info', refId: id, title: `Complaint #${id} registered`, body: REGISTERED.detail });
  emailService.sendToCustomer(customerId, `Complaint #${id} registered`,
    `Sorry for the inconvenience. Your complaint #${id}${order ? ` for order ${order.id}` : ''} has been registered successfully.\n\nOur team will review it, and you will be notified here and by email as soon as there is an update.`);
  return { status: 201, id };
}

function listForCustomer(customerId) {
  const rows = db.prepare(`
    SELECT c.*, o.product, (SELECT COUNT(*) FROM complaint_files f WHERE f.complaintId = c.id) AS photoCount
    FROM complaints c LEFT JOIN orders o ON o.id = c.orderId
    WHERE c.customerId = ? ORDER BY c.id DESC`).all(customerId);
  return rows.map((c) => {
    const s = customerStatusFor(c);
    return {
      id: c.id, ts: c.createdAt, orderId: c.orderId, product: c.product || null,
      issue: String(c.complaintText).slice(0, 160), photoCount: c.photoCount,
      status: s.status, label: s.label, detail: s.detail, proposal: s.proposal,
    };
  });
}

// ---------- admin ----------
function listForAdmin({ status, search } = {}) {
  const all = db.prepare(`
    SELECT c.id, c.customerId, c.orderId, c.issueKey, c.complaintText, c.status, c.createdAt, c.auditId,
           cu.name AS customerName, o.product, o.amount,
           (SELECT COUNT(*) FROM complaint_files f WHERE f.complaintId = c.id) AS photoCount
    FROM complaints c
    LEFT JOIN customers cu ON cu.id = c.customerId
    LEFT JOIN orders o ON o.id = c.orderId
    ORDER BY c.id DESC`).all();
  const counts = { all: all.length, registered: 0, investigated: 0, awaiting_customer: 0, resolved: 0 };
  for (const c of all) if (counts[c.status] !== undefined) counts[c.status] += 1;
  let rows = all;
  if (status && status !== 'all') rows = rows.filter((c) => c.status === status);
  if (search) {
    const q = String(search).toLowerCase().trim();
    rows = rows.filter((c) => [c.id, c.customerId, c.customerName, c.orderId, c.complaintText, c.product].some((v) => String(v || '').toLowerCase().includes(q)));
  }
  return { complaints: rows, counts };
}

function detail(id) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id);
  if (!c) return null;
  const customer = db.prepare('SELECT id, name, email, tier, joinedOn FROM customers WHERE id=?').get(c.customerId) || null;
  const order = c.orderId ? db.prepare('SELECT * FROM orders WHERE id=?').get(c.orderId) : null;
  const photos = db.prepare('SELECT id, mime, name, size, data FROM complaint_files WHERE complaintId=? ORDER BY id').all(id)
    .map((f) => ({ id: f.id, name: f.name, size: f.size, dataUrl: `data:${f.mime};base64,${f.data.toString('base64')}` }));
  return {
    complaint: { id: c.id, customerId: c.customerId, orderId: c.orderId, issueKey: c.issueKey, complaintText: c.complaintText, status: c.status, createdAt: c.createdAt, investigatedAt: c.investigatedAt, resolvedAt: c.resolvedAt, resolvedBy: c.resolvedBy, auditId: c.auditId },
    customer, order,
    payments: order ? db.prepare('SELECT * FROM payments WHERE orderId=? ORDER BY timestamp').all(order.id) : [],
    refunds: order ? db.prepare('SELECT * FROM refunds WHERE orderId=? ORDER BY initiatedAt').all(order.id) : [],
    photos,
    investigation: parse(c.investigation),
    case: c.auditId ? caseService.getCase(c.auditId) : null,
  };
}

async function investigate(id) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id);
  if (!c) return { status: 404, error: 'Complaint not found' };
  if (c.status === 'resolved') return { status: 409, error: 'This complaint is already resolved' };
  if (c.status === 'awaiting_customer') return { status: 409, error: 'An offer was already sent. Waiting for the customer.' };

  const files = db.prepare('SELECT mime, data FROM complaint_files WHERE complaintId=? ORDER BY id').all(id)
    .map((f) => ({ buffer: f.data, mimetype: f.mime }));
  const out = await runInvestigation({ customerId: c.customerId, complaintText: c.complaintText, files, execute: false, complaintId: c.id, extraEvidence: { complaintId: c.id, dryRun: true } });
  if (out.error) return { status: out.error.status, error: out.error.message };

  db.prepare("UPDATE complaints SET status='investigated', investigatedAt=?, auditId=?, investigation=? WHERE id=?")
    .run(new Date().toISOString(), out.data.auditId, JSON.stringify(out.data), id);
  return { status: 200, data: out.data };
}

async function resolve({ complaintId, action, amount, customerMessage, note, admin }) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(complaintId);
  if (!c) return { status: 404, error: 'Complaint not found' };
  if (c.status === 'resolved') return { status: 409, error: 'This complaint is already resolved' };
  if (c.status === 'awaiting_customer') return { status: 409, error: 'Waiting for the customer to answer the offer' };
  if (c.status !== 'investigated' || !c.auditId) return { status: 409, error: 'Investigate this complaint first' };

  const stored = parse(c.investigation);
  if (!stored) return { status: 409, error: 'No investigation result stored. Investigate again.' };
  const actor = { name: (admin && admin.name) || 'Admin', email: (admin && admin.email) || 'admin@inquest.local' };
  const reason = note && String(note).trim().length >= 5 ? String(note).trim() : `Handled by ${actor.name}`;
  let newStatus = 'resolved';

  if (action === 'CONFIRM_AI') {
    if (!stored.decision || stored.decision.decision !== 'AUTO_RESOLVE') {
      return { status: 409, error: 'The AI did not recommend automatic resolution. Use Refund or Close instead.' };
    }
    const result = executeActions({ customerId: c.customerId, analysis: stored.analysis, rootCause: stored.rootCause, decision: stored.decision, investigation: stored.investigation });
    if (result.error) return { status: 500, error: 'Could not execute the actions: ' + result.error };
    const order = stored.investigation && stored.investigation.focusOrder ? stored.investigation.focusOrder : null;
    const msg = customerMessage || (!result.refund ? caseService.answeredMessage(stored.rootCause.matchedPolicy, order, c.customerId) : null);
    audit.append({
      entryType: 'OVERRIDE', actor: `${actor.name} <${actor.email}>`, customerId: c.customerId, refId: c.auditId,
      complaintText: c.complaintText, intent: stored.analysis.intent, matchedPolicy: stored.rootCause.matchedPolicy,
      decision: 'OVERRIDE_RESOLVE', reasoning: reason,
      evidence: { originalDecision: 'AUTO_RESOLVE', resolution: 'CONFIRM_AI', customerMessage: msg },
      actions: result,
    });
    notifyCaseUpdate(c.auditId, 'OVERRIDE_RESOLVE');
  } else if (action === 'SEND_OFFER') {
    const proposal = createProposal({ auditId: c.auditId, customerId: c.customerId, decision: stored.decision, rootCause: stored.rootCause, investigation: stored.investigation });
    if (!proposal) return { status: 409, error: 'No offer can be sent for this decision. Use Refund or Close instead.' };
    newStatus = 'awaiting_customer';
    notifyCaseUpdate(c.auditId, 'OFFER_SENT');
  } else {
    const out = overrideService.applyOverride({
      auditId: c.auditId, type: 'RESOLVE', reason, actorName: actor.name, actorEmail: actor.email,
      resolution: action, amount, customerMessage: customerMessage || null,
    });
    if (out.status !== 200) return out;
  }

  db.prepare('UPDATE complaints SET status=?, resolvedAt=?, resolvedBy=? WHERE id=?')
    .run(newStatus, newStatus === 'resolved' ? new Date().toISOString() : null, newStatus === 'resolved' ? actor.name : null, complaintId);
  return { status: 200, data: { complaintId, status: newStatus, customerView: customerStatusFor({ ...c, auditId: c.auditId }) } };
}

// A customer answered an offer: the complaint is now resolved
function onProposalAnswered(auditId) {
  db.prepare("UPDATE complaints SET status='resolved', resolvedAt=?, resolvedBy='Customer' WHERE auditId=?").run(new Date().toISOString(), auditId);
}

module.exports = { register, listForCustomer, listForAdmin, detail, investigate, resolve, onProposalAnswered };
