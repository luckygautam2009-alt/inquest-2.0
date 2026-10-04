const db = require('../db/connection');
require('./auditService');
require('./proposalService');

const fmtInr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const ALREADY = ['ALREADY_REFUNDED', 'REFUND_ALREADY_EXISTS'];

const STATUS_LABEL = {
  auto_resolved: 'Auto-resolved by AI',
  answered: 'Answered by AI (no action needed)',
  awaiting_customer: 'Awaiting customer',
  needs_attention: 'Needs attention',
  resolved_by_staff: 'Resolved by staff',
  resolved_with_customer: 'Resolved with customer',
  pending_confirmation: 'Investigated, awaiting admin confirmation',
};

function proposalSummary(type, orderId) {
  if (type === 'DELAY_COMPENSATION') return 'Your order ' + orderId + ' is running late. Choose how we should make it right:';
  if (type === 'RETURN_PICKUP') return 'Order ' + orderId + ' is eligible for return. Shall we schedule a pickup?';
  if (type === 'REVERSE_PICKUP') return 'We could not fully verify the damage from the photo. Shall we arrange a pickup of order ' + orderId + ' for inspection?';
  return 'We found a resolution under our policy. Shall we proceed?';
}

function describeActions(a) {
  if (!a) return 'We checked your order and resolved this.';
  if (a.refund) return 'Refund ' + a.refund.id + ' of ' + fmtInr(a.refund.amount) + ' initiated (' + a.refund.status + ').';
  if (ALREADY.includes(a.skipped)) return 'A refund has already been issued for this order.';
  if (a.orderUpdate && a.orderUpdate.courierStatus === 'expedited') return 'Your delivery has been expedited.';
  if (a.orderUpdate && a.orderUpdate.returnStatus === 'pickup_scheduled') return 'A pickup has been scheduled.';
  return 'We checked your order and resolved this.';
}

// When the AI only had to look something up, say what it found (never a fake "resolved")
function answeredMessage(policy, order, customerId) {
  if (policy === 'POLICY11' && order && order.status === 'in_transit') {
    return 'Your order is on its way and is not late yet. Expected delivery: ' + (order.estimatedDelivery || 'soon') + '. If it does not arrive by then, report it again and we will make it right.';
  }
  if (policy === 'POLICY2' && order) {
    const r = db.prepare("SELECT * FROM refunds WHERE orderId=? AND customerId=? AND status != 'cancelled' ORDER BY initiatedAt DESC").get(order.id, customerId);
    if (r) return 'Your refund ' + r.id + ' of ' + fmtInr(r.amount) + ' is ' + r.status + '. Bank settlement usually takes 5 to 7 business days.';
    return 'We could not find a refund on this order yet.';
  }
  if (policy === 'POLICY5' && order) {
    return 'Order ' + order.id + ' was cancelled' + (order.cancellationReason ? ': ' + order.cancellationReason : '') + '.';
  }
  return 'We reviewed your order and found nothing that needs fixing right now.';
}

const actorName = (a) => String(a || '').split('<')[0].trim() || 'Staff';

function derive({ d, a, ev, proposal, response, overrides, order }) {
  const resolveOv = overrides.find((o) => o.decision === 'OVERRIDE_RESOLVE');
  if (resolveOv) {
    const oa = parse(resolveOv.actions) || {};
    const oev = parse(resolveOv.evidence) || {};
    const text = oa.refund ? 'Refund ' + oa.refund.id + ' of ' + fmtInr(oa.refund.amount) + ' approved.' : ALREADY.includes(oa.skipped) ? 'A refund has already been issued for this order.' : oev.resolution === 'NO_REFUND' ? 'Closed without a refund.' : oev.customerMessage ? '' : 'Resolved.';
    return {
      status: 'resolved_by_staff', resolvedBy: actorName(resolveOv.actor), detail: text || oev.customerMessage || 'Resolved.',
      customerStatus: 'resolved', customerLabel: 'Resolved', customerDetail: [text, oev.customerMessage].filter(Boolean).join(' '),
    };
  }
  const latestOv = overrides[overrides.length - 1];
  if (latestOv) {
    return {
      status: 'needs_attention', resolvedBy: null,
      detail: latestOv.decision === 'OVERRIDE_UNDO' ? 'AI action was undone by staff: ' + latestOv.reasoning : 'Escalated by staff: ' + latestOv.reasoning,
      customerStatus: 'in_review', customerLabel: 'Under review by our team', customerDetail: 'Our support team is looking into this.',
    };
  }
  if (proposal) {
    if (proposal.status === 'awaiting_customer') {
      return {
        status: 'awaiting_customer', resolvedBy: null, detail: 'Waiting for the customer to choose an option.',
        customerStatus: 'awaiting_you', customerLabel: 'Action needed', customerDetail: 'Please choose how you would like us to proceed.',
      };
    }
    if (proposal.status === 'declined') {
      return {
        status: 'resolved_with_customer', resolvedBy: 'Customer', detail: 'Customer declined the offer.',
        customerStatus: 'resolved', customerLabel: 'Closed', customerDetail: 'No changes were made, as you chose.',
      };
    }
    const text = describeActions(parse(response && response.actions));
    return {
      status: 'resolved_with_customer', resolvedBy: 'Customer', detail: text,
      customerStatus: 'resolved', customerLabel: 'Resolved', customerDetail: text,
    };
  }
  if (ev && ev.dryRun) {
    return {
      status: 'pending_confirmation', resolvedBy: null, detail: 'AI recommended: ' + String(d.decision).replace(/_/g, ' ').toLowerCase() + '. Waiting for admin confirmation.',
      customerStatus: 'in_review', customerLabel: 'Under review by our team', customerDetail: 'Our support team is reviewing your complaint.',
    };
  }
  if (d.decision === 'AUTO_RESOLVE') {
    if (a.refund || ALREADY.includes(a.skipped)) {
      const text = describeActions(a);
      return { status: 'auto_resolved', resolvedBy: 'AI', detail: text, customerStatus: 'resolved', customerLabel: 'Resolved', customerDetail: text };
    }
    const text = answeredMessage(d.matchedPolicy, order, d.customerId);
    return { status: 'answered', resolvedBy: 'AI', detail: text, customerStatus: 'answered', customerLabel: 'Checked', customerDetail: text };
  }
  return {
    status: 'needs_attention', resolvedBy: null, detail: d.reasoning,
    customerStatus: 'in_review', customerLabel: 'Under review by our team',
    customerDetail: 'Your complaint has been passed to a support specialist.',
  };
}

const OVERRIDE_TITLE = {
  OVERRIDE_UNDO: 'Staff undid the AI action',
  OVERRIDE_ESCALATE: 'Staff escalated the case',
  OVERRIDE_RESOLVE: 'Staff resolved the case',
};

function buildOne(d, rel, customers) {
  const ev = parse(d.evidence) || {};
  const a = parse(d.actions) || {};
  const order = ev.orderId ? db.prepare('SELECT * FROM orders WHERE id=?').get(ev.orderId) : null;
  const proposalRow = db.prepare('SELECT * FROM proposals WHERE auditId=?').get(d.id) || null;
  const response = rel.find((r) => r.entryType === 'CUSTOMER_RESPONSE') || null;
  const overrides = rel.filter((r) => r.entryType === 'OVERRIDE');
  const st = derive({ d, a, ev, proposal: proposalRow, response, overrides, order });

  const events = [{ ts: d.ts, actor: 'AI', title: 'AI decision: ' + String(d.decision).replace(/_/g, ' '), text: d.reasoning }];
  if (a.refund) events.push({ ts: d.ts, actor: 'AI', title: 'Refund ' + a.refund.id + ' initiated', text: fmtInr(a.refund.amount) });
  if (a.ticket && !a.ticket.reused) events.push({ ts: d.ts, actor: 'AI', title: 'Ticket ' + a.ticket.id + ' ' + a.ticket.status });
  for (const r of rel) {
    if (r.entryType === 'CUSTOMER_RESPONSE') events.push({ ts: r.ts, actor: 'Customer', title: r.reasoning });
    else events.push({ ts: r.ts, actor: actorName(r.actor), title: OVERRIDE_TITLE[r.decision] || r.decision, text: r.reasoning });
  }

  const proposal = proposalRow && proposalRow.status === 'awaiting_customer'
    ? { auditId: d.id, customerId: d.customerId, orderId: ev.orderId, type: proposalRow.type, summary: proposalSummary(proposalRow.type, ev.orderId), options: JSON.parse(proposalRow.options) }
    : null;

  return {
    id: d.id, ts: d.ts, customerId: d.customerId, customerName: customers.get(d.customerId) || null,
    orderId: ev.orderId || null, product: order ? order.product : null, amount: order ? order.amount : null,
    complaintText: d.complaintText, intent: d.intent, policy: d.matchedPolicy, decision: d.decision, confidence: d.confidence,
    reasoning: d.reasoning,
    risk: ev.risk ? { score: ev.risk.score, level: ev.risk.level } : null,
    photo: ev.photo ? { provided: ev.photo.provided, reused: !!(ev.photo.reuse && ev.photo.reuse.detected), visionConfidence: ev.photo.vision ? ev.photo.vision.confidence : null } : null,
    status: st.status, label: STATUS_LABEL[st.status], detail: st.detail, resolvedBy: st.resolvedBy,
    needsAttention: st.status === 'needs_attention' || st.status === 'pending_confirmation',
    customerStatus: st.customerStatus, customerLabel: st.customerLabel, customerDetail: st.customerDetail,
    proposal, actions: a, events,
  };
}

function customerNames() {
  return new Map(db.prepare('SELECT id, name FROM customers').all().map((c) => [c.id, c.name]));
}

function buildCases({ customerId = null, limit = 500 } = {}) {
  const rows = db.prepare(
    "SELECT * FROM audit_log WHERE entryType IN ('DECISION','CUSTOMER_RESPONSE','OVERRIDE')" + (customerId ? ' AND customerId = ?' : '') + ' ORDER BY id ASC'
  ).all(...(customerId ? [customerId] : []));
  const decisions = [];
  const related = new Map();
  for (const r of rows) {
    if (r.entryType === 'DECISION') decisions.push(r);
    else {
      if (!related.has(r.refId)) related.set(r.refId, []);
      related.get(r.refId).push(r);
    }
  }
  const names = customerNames();
  return decisions.map((d) => buildOne(d, related.get(d.id) || [], names)).reverse().slice(0, limit);
}

function getCase(id) {
  const d = db.prepare("SELECT * FROM audit_log WHERE id=? AND entryType='DECISION'").get(id);
  if (!d) return null;
  const rel = db.prepare("SELECT * FROM audit_log WHERE refId=? AND entryType IN ('CUSTOMER_RESPONSE','OVERRIDE') ORDER BY id ASC").all(id);
  return buildOne(d, rel, customerNames());
}

function latestByOrder(customerId) {
  const map = new Map();
  for (const c of buildCases({ customerId })) if (c.orderId && !map.has(c.orderId)) map.set(c.orderId, c);
  return map;
}

function countByStatus(cases) {
  const counts = { total: cases.length };
  for (const k of Object.keys(STATUS_LABEL)) counts[k] = 0;
  for (const c of cases) counts[c.status] += 1;
  return counts;
}

// Customer-safe projection: no risk score, fraud signals, policy ids or internal reasoning
function forCustomer(c) {
  return {
    id: c.id, ts: c.ts, orderId: c.orderId, product: c.product,
    issue: c.complaintText ? String(c.complaintText).slice(0, 160) : null,
    status: c.customerStatus, label: c.customerLabel, detail: c.customerDetail, proposal: c.proposal || undefined,
  };
}

module.exports = { buildCases, getCase, latestByOrder, countByStatus, forCustomer, answeredMessage, STATUS_LABEL };
