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
const { evaluateAutomation, autoEnabled } = require('./automationPolicy');

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
{
  const have = db.prepare('PRAGMA table_info(complaints)').all().map((c) => c.name);
  for (const [name, type] of [['decision', 'TEXT'], ['confidence', 'REAL'], ['decisionReason', 'TEXT'], ['automation', 'TEXT'], ['actionSummary', 'TEXT'], ['infoRequest', 'TEXT'], ['lastReplyAt', 'TEXT']]) {
    if (!have.includes(name)) db.exec(`ALTER TABLE complaints ADD COLUMN ${name} ${type}`);
  }
}

// Lifecycle: registered -> investigating -> auto_resolved | awaiting_customer | needs_info | human_review
//            (manual dry-run: investigated) -> resolved
const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const REGISTERED = { status: 'registered', label: 'Registered', detail: 'We have received your complaint and are checking it now.' };

// One investigation at a time keeps Gemini calls orderly
let chain = Promise.resolve();
function enqueue(task) {
  chain = chain.then(task).catch((e) => console.error('[complaint queue]', e && e.message));
  return chain;
}

function customerStatusFor(c) {
  if (c.status === 'needs_info') return { status: 'needs_info', label: 'More information needed', detail: c.infoRequest || 'Please share more details about the problem.' };
  if (['registered', 'investigating'].includes(c.status) || !c.auditId) return REGISTERED;
  const k = caseService.getCase(c.auditId);
  if (!k) return REGISTERED;
  return { status: k.customerStatus, label: k.customerLabel, detail: k.customerDetail, proposal: k.proposal || undefined };
}

const whoOf = (c) => {
  const cu = db.prepare('SELECT name FROM customers WHERE id=?').get(c.customerId);
  return `${(cu && cu.name) || c.customerId}${c.orderId ? ' · ' + c.orderId : ''}`;
};

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
    const where = `${customer.name || customerId}${order ? ' · ' + order.id : ''}`;
    notifications.notify({ audience: 'admin', type: 'NEW_COMPLAINT', severity: autoEnabled() ? 'info' : 'attention', refId: id, dedupeKey: `new:${id}`, title: `New complaint #${id}: ${where}`, body: finalText.slice(0, 160) });
    notifications.notify({ audience: 'customer', customerId, type: 'COMPLAINT_REGISTERED', severity: 'info', refId: id, dedupeKey: `registered:${id}`, title: `Complaint #${id} registered`, body: 'We received your complaint and will keep you updated.' });
  })();

  emailService.sendToCustomer(customerId, `Complaint #${id} registered`,
    `Sorry for the inconvenience. Your complaint #${id}${order ? ` for order ${order.id}` : ''} has been registered successfully.\n\nOur team will look into it, and you will be notified here and by email as soon as there is an update.`);
  if (autoEnabled()) enqueue(() => processAuto(id));
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
      canReply: c.status === 'needs_info', resolvedAt: c.resolvedAt,
    };
  });
}

// The customer answers a request for more information; the complaint is investigated again
function reply({ complaintId, customerId, message, files }) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=? AND customerId=?').get(complaintId, customerId);
  if (!c) return { status: 404, error: 'Complaint not found' };
  if (c.status !== 'needs_info') return { status: 409, error: 'This complaint is not waiting for more information' };
  const addition = message ? `\n\nAdditional information from the customer: ${message}` : '\n\nAdditional information from the customer: photo(s) attached.';
  db.transaction(() => {
    db.prepare("UPDATE complaints SET complaintText = complaintText || ?, status='registered', infoRequest=NULL, lastReplyAt=? WHERE id=?").run(addition, new Date().toISOString(), complaintId);
    for (const f of files) {
      db.prepare('INSERT INTO complaint_files (complaintId, mime, name, size, data) VALUES (?,?,?,?,?)')
        .run(complaintId, f.mimetype, String(f.originalname || 'photo').slice(0, 120), f.size || f.buffer.length, f.buffer);
    }
  })();
  notifications.notify({ audience: 'admin', type: 'CUSTOMER_REPLY', severity: 'info', refId: complaintId, title: `Customer replied on complaint #${complaintId}`, body: whoOf(c) });
  if (autoEnabled()) enqueue(() => processAuto(complaintId));
  return { status: 200 };
}

// ---------- automatic processing ----------
async function park(id, status, reason) {
  db.prepare('UPDATE complaints SET status=?, decisionReason=? WHERE id=?').run(status, reason, id);
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id);
  notifications.notify({ audience: 'admin', type: 'ESCALATION', severity: 'attention', refId: id, dedupeKey: `review:${id}:${Date.now()}`, title: `Needs review #${id}: ${whoOf(c)}`, body: String(reason).slice(0, 160) });
}

async function processAuto(id) {
  const claimed = db.prepare("UPDATE complaints SET status='investigating' WHERE id=? AND status='registered'").run(id).changes;
  if (!claimed) return;
  try {
    const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id);
    const files = db.prepare('SELECT mime, data FROM complaint_files WHERE complaintId=? ORDER BY id').all(id).map((f) => ({ buffer: f.data, mimetype: f.mime }));
    const out = await runInvestigation({ customerId: c.customerId, complaintText: c.complaintText, files, complaintId: id, autoPolicy: evaluateAutomation, autoExecute: true, extraEvidence: { complaintId: id } });
    if (out.error) return await park(id, 'human_review', `Automatic investigation could not run: ${out.error.message}`);
    await applyOutcome(c, out.data);
  } catch (err) {
    console.error('[complaint] auto investigation failed:', err.message);
    await park(id, 'human_review', `Automatic investigation failed: ${String(err.message).slice(0, 120)}`);
  }
}

async function applyOutcome(c, data) {
  const id = c.id;
  const d = data.decision;
  const auto = data.automation || { kind: 'REVIEW', reason: d.reasoning, gates: [] };
  const now = new Date().toISOString();
  let status = 'human_review';
  let infoRequest = null;
  let proposal = null;

  if (auto.kind === 'EXECUTE') status = 'auto_resolved';
  else if (auto.kind === 'OFFER') {
    proposal = createProposal({ auditId: data.auditId, customerId: c.customerId, decision: d, rootCause: data.rootCause, investigation: data.investigation });
    status = proposal ? 'awaiting_customer' : 'human_review';
  } else if (auto.kind === 'INFO') {
    status = 'needs_info';
    infoRequest = d.infoRequest || 'Please share more details about the problem.';
  }

  const k = data.auditId ? caseService.getCase(data.auditId) : null;
  const summary = status === 'auto_resolved' && k ? k.customerDetail : null;
  db.prepare(`UPDATE complaints SET status=@status, auditId=@auditId, investigation=@investigation, decision=@decision, confidence=@confidence,
      decisionReason=@reason, automation=@automation, investigatedAt=@now, resolvedAt=@resolvedAt, resolvedBy=@resolvedBy, actionSummary=@summary, infoRequest=@infoRequest WHERE id=@id`).run({
    id, status, auditId: data.auditId, investigation: JSON.stringify(data), decision: d.decision, confidence: Number(d.confidence) || null,
    reason: auto.kind === 'REVIEW' && auto.reason ? auto.reason : d.reasoning, automation: JSON.stringify(auto), now,
    resolvedAt: status === 'auto_resolved' ? now : null, resolvedBy: status === 'auto_resolved' ? 'AI' : null, summary, infoRequest,
  });

  const who = whoOf(c);
  if (status === 'auto_resolved' && k) {
    const fresh = notifications.notify({ audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', severity: k.customerStatus === 'resolved' ? 'success' : 'info', refId: id, dedupeKey: `resolved:${id}`, title: `Complaint #${id}: ${k.customerLabel}`, body: k.customerDetail });
    if (fresh) emailService.sendToCustomer(c.customerId, `Complaint #${id}: ${k.customerLabel}`, k.customerDetail);
    notifications.notify({ audience: 'admin', type: 'AUTO_RESOLVED', severity: 'info', refId: id, dedupeKey: `auto:${id}`, title: `AI resolved #${id}: ${who}`, body: k.customerDetail });
  } else if (status === 'awaiting_customer') {
    const text = k && k.proposal ? k.proposal.summary : 'We have an offer for you. Please open My complaints to choose.';
    const fresh = notifications.notify({ audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', severity: 'attention', refId: id, dedupeKey: `offer:${id}:${data.auditId}`, title: `Complaint #${id}: action needed`, body: text });
    if (fresh) emailService.sendToCustomer(c.customerId, `Complaint #${id}: action needed`, `${text}\n\nPlease open My complaints in the store to choose.`);
    notifications.notify({ audience: 'admin', type: 'AWAITING_CUSTOMER', severity: 'info', refId: id, dedupeKey: `offer-admin:${id}:${data.auditId}`, title: `Offer sent #${id}: ${who}`, body: 'Waiting for the customer to choose.' });
  } else if (status === 'needs_info') {
    const fresh = notifications.notify({ audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', severity: 'attention', refId: id, dedupeKey: `info:${id}:${data.auditId}`, title: `Complaint #${id}: more information needed`, body: infoRequest });
    if (fresh) emailService.sendToCustomer(c.customerId, `Complaint #${id}: more information needed`, `${infoRequest}\n\nPlease open My complaints in the store and add the details.`);
    notifications.notify({ audience: 'admin', type: 'NEEDS_INFO', severity: 'info', refId: id, dedupeKey: `info-admin:${id}:${data.auditId}`, title: `Asked the customer for details #${id}: ${who}`, body: infoRequest });
  } else {
    notifications.notify({ audience: 'admin', type: 'ESCALATION', severity: 'attention', refId: id, dedupeKey: `review:${id}:${data.auditId}`, title: `Needs review #${id}: ${who}`, body: String(auto.reason || d.reasoning).slice(0, 160) });
  }
}

// Complaints left half-processed by a restart are picked up again
function recoverStuck() {
  const stuck = db.prepare("SELECT id FROM complaints WHERE status='investigating'").all();
  for (const s of stuck) db.prepare("UPDATE complaints SET status='registered' WHERE id=?").run(s.id);
  if (autoEnabled()) {
    for (const r of db.prepare("SELECT id FROM complaints WHERE status='registered' AND investigation IS NULL").all()) enqueue(() => processAuto(r.id));
  }
}
setTimeout(recoverStuck, 3000);

// ---------- admin ----------
const GROUPS = { new: ['registered', 'investigating'], attention: ['human_review', 'investigated'], waiting: ['needs_info', 'awaiting_customer'] };

function listForAdmin({ status, search } = {}) {
  const all = db.prepare(`
    SELECT c.id, c.customerId, c.orderId, c.issueKey, c.complaintText, c.status, c.createdAt, c.auditId,
           c.decision, c.confidence, c.decisionReason, c.actionSummary, c.infoRequest, c.resolvedBy,
           cu.name AS customerName, o.product, o.amount,
           (SELECT COUNT(*) FROM complaint_files f WHERE f.complaintId = c.id) AS photoCount
    FROM complaints c
    LEFT JOIN customers cu ON cu.id = c.customerId
    LEFT JOIN orders o ON o.id = c.orderId
    ORDER BY c.id DESC`).all();
  const counts = { all: all.length, registered: 0, investigating: 0, auto_resolved: 0, human_review: 0, investigated: 0, needs_info: 0, awaiting_customer: 0, resolved: 0 };
  for (const c of all) if (counts[c.status] !== undefined) counts[c.status] += 1;
  const summary = {
    total: all.length,
    autoResolved: counts.auto_resolved,
    pendingHumanReview: counts.human_review + counts.investigated,
    awaitingCustomerInfo: counts.needs_info + counts.awaiting_customer,
  };
  let rows = all;
  if (status && status !== 'all') {
    const wanted = GROUPS[status] || [status];
    rows = rows.filter((c) => wanted.includes(c.status));
  }
  if (search) {
    const q = String(search).toLowerCase().trim();
    rows = rows.filter((c) => [c.id, c.customerId, c.customerName, c.orderId, c.complaintText, c.product].some((v) => String(v || '').toLowerCase().includes(q)));
  }
  return { complaints: rows, counts, summary };
}

function detail(id) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id);
  if (!c) return null;
  const customer = db.prepare('SELECT id, name, email, tier, joinedOn FROM customers WHERE id=?').get(c.customerId) || null;
  const order = c.orderId ? db.prepare('SELECT * FROM orders WHERE id=?').get(c.orderId) : null;
  const photos = db.prepare('SELECT id, mime, name, size, data FROM complaint_files WHERE complaintId=? ORDER BY id').all(id)
    .map((f) => ({ id: f.id, name: f.name, size: f.size, dataUrl: `data:${f.mime};base64,${f.data.toString('base64')}` }));
  return {
    complaint: {
      id: c.id, customerId: c.customerId, orderId: c.orderId, issueKey: c.issueKey, complaintText: c.complaintText, status: c.status,
      createdAt: c.createdAt, investigatedAt: c.investigatedAt, resolvedAt: c.resolvedAt, resolvedBy: c.resolvedBy, auditId: c.auditId,
      decision: c.decision, confidence: c.confidence, decisionReason: c.decisionReason, actionSummary: c.actionSummary, infoRequest: c.infoRequest,
      automation: parse(c.automation),
    },
    customer, order,
    payments: order ? db.prepare('SELECT * FROM payments WHERE orderId=? ORDER BY timestamp').all(order.id) : [],
    refunds: order ? db.prepare('SELECT * FROM refunds WHERE orderId=? ORDER BY initiatedAt').all(order.id) : [],
    photos,
    investigation: parse(c.investigation),
    case: c.auditId ? caseService.getCase(c.auditId) : null,
  };
}

function getFile({ complaintId, fileId, customerId = null }) {
  const sql = 'SELECT f.mime, f.data FROM complaint_files f JOIN complaints c ON c.id = f.complaintId WHERE f.id = ? AND c.id = ?' + (customerId ? ' AND c.customerId = ?' : '');
  return db.prepare(sql).get(...(customerId ? [fileId, complaintId, customerId] : [fileId, complaintId])) || null;
}

// Returns the stored result unless a (re-)run is needed, so opening a complaint never triggers a duplicate investigation
async function investigate(id, { force = false } = {}) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(id);
  if (!c) return { status: 404, error: 'Complaint not found' };
  if (c.status === 'investigating') return { status: 409, error: 'Automatic investigation is still running. Try again in a few seconds.' };
  const stored = parse(c.investigation);
  if (stored && !force) return { status: 200, data: stored, cached: true };
  if (['auto_resolved', 'resolved', 'awaiting_customer'].includes(c.status)) return { status: 409, error: 'This complaint is already closed or waiting for the customer' };

  const files = db.prepare('SELECT mime, data FROM complaint_files WHERE complaintId=? ORDER BY id').all(id).map((f) => ({ buffer: f.data, mimetype: f.mime }));
  const out = await runInvestigation({ customerId: c.customerId, complaintText: c.complaintText, files, complaintId: c.id, autoPolicy: evaluateAutomation, autoExecute: false, extraEvidence: { complaintId: c.id } });
  if (out.error) return { status: out.error.status, error: out.error.message };
  db.prepare("UPDATE complaints SET status='investigated', investigatedAt=?, auditId=?, investigation=?, decision=?, confidence=?, decisionReason=?, automation=? WHERE id=?")
    .run(new Date().toISOString(), out.data.auditId, JSON.stringify(out.data), out.data.decision.decision, Number(out.data.decision.confidence) || null, out.data.decision.reasoning, JSON.stringify(out.data.automation), id);
  return { status: 200, data: out.data, cached: false };
}

async function resolve({ complaintId, action, amount, customerMessage, note, admin }) {
  const c = db.prepare('SELECT * FROM complaints WHERE id=?').get(complaintId);
  if (!c) return { status: 404, error: 'Complaint not found' };
  if (['resolved', 'auto_resolved'].includes(c.status)) return { status: 409, error: 'This complaint is already resolved' };
  if (c.status === 'awaiting_customer') return { status: 409, error: 'Waiting for the customer to answer the offer' };
  const actor = { name: (admin && admin.name) || 'Admin', email: (admin && admin.email) || 'admin@inquest.local' };
  const reason = note && String(note).trim().length >= 5 ? String(note).trim() : `Handled by ${actor.name}`;

  if (action === 'REQUEST_INFO') {
    const msg = String(customerMessage || '').trim();
    if (msg.length < 8) return { status: 400, error: 'Write what information you need from the customer (at least 8 characters).' };
    if (c.auditId) {
      audit.append({
        entryType: 'OVERRIDE', actor: `${actor.name} <${actor.email}>`, customerId: c.customerId, refId: c.auditId, complaintText: c.complaintText,
        decision: 'OVERRIDE_REQUEST_INFO', reasoning: msg, evidence: { originalDecision: c.decision }, actions: null,
      });
    }
    db.prepare("UPDATE complaints SET status='needs_info', infoRequest=? WHERE id=?").run(msg, complaintId);
    const fresh = notifications.notify({ audience: 'customer', customerId: c.customerId, type: 'COMPLAINT_UPDATE', severity: 'attention', refId: complaintId, dedupeKey: `info:${complaintId}:${Date.now()}`, title: `Complaint #${complaintId}: more information needed`, body: msg });
    if (fresh) emailService.sendToCustomer(c.customerId, `Complaint #${complaintId}: more information needed`, `${msg}\n\nPlease open My complaints in the store and add the details.`);
    return { status: 200, data: { complaintId, status: 'needs_info' } };
  }

  if (!['investigated', 'human_review'].includes(c.status) || !c.auditId) return { status: 409, error: 'Investigate this complaint first' };
  const stored = parse(c.investigation);
  if (!stored) return { status: 409, error: 'No investigation result stored. Investigate again.' };
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
  return { status: 200, data: { complaintId, status: newStatus, customerView: customerStatusFor({ ...c, status: newStatus, auditId: c.auditId }) } };
}

// A customer answered an offer: the complaint is now resolved
function onProposalAnswered(auditId) {
  db.prepare("UPDATE complaints SET status='resolved', resolvedAt=?, resolvedBy='Customer' WHERE auditId=?").run(new Date().toISOString(), auditId);
}

module.exports = { register, reply, listForCustomer, listForAdmin, detail, getFile, investigate, resolve, onProposalAnswered };
