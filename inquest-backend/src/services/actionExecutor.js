const db = require('../db/connection');

const R = {
  dup: 'Duplicate payment refund (POLICY7)',
  recon: 'Reconciliation refund: gateway debit without local order (POLICY1)',
  ret: 'Refund for return received at warehouse (POLICY4)',
  dmg: 'Photo-verified damaged item refund (POLICY6)',
};

function nextId(table, prefix) {
  const nums = db.prepare(`SELECT id FROM ${table}`).all()
    .filter((r) => String(r.id).startsWith(prefix))
    .map((r) => parseInt(String(r.id).slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

const isSuccess = (p) => p.status === 'success' || p.gatewayStatus === 'success';

function refundCount(orderId, customerId, reason) {
  return db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE orderId=? AND customerId=? AND reason=? AND status != 'cancelled'")
    .get(orderId, customerId, reason).n;
}

function anyRefundCount(orderId, customerId) {
  return db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE orderId=? AND customerId=? AND status != 'cancelled'")
    .get(orderId, customerId).n;
}

function createRefund({ orderId, customerId, amount, reason, gatewayRef }) {
  const refund = {
    id: nextId('refunds', 'RFD'), orderId, customerId, amount, status: 'pending',
    initiatedAt: new Date().toISOString(), completedAt: null, reason, gatewayRef: gatewayRef || null,
  };
  db.prepare(`INSERT INTO refunds (id, orderId, customerId, amount, status, initiatedAt, completedAt, reason, gatewayRef)
    VALUES (@id, @orderId, @customerId, @amount, @status, @initiatedAt, @completedAt, @reason, @gatewayRef)`).run(refund);
  return refund;
}

function createTicket({ customerId, category, subject, status, resolution, notes }) {
  const existing = db.prepare('SELECT * FROM tickets WHERE customerId=? AND subject=? AND status=?')
    .get(customerId, subject, status);
  if (existing) return { ...existing, reused: true };
  const today = new Date().toISOString().slice(0, 10);
  const ticket = {
    id: nextId('tickets', 'TICKET'), customerId, category, subject, status, date: today,
    resolvedOn: status === 'resolved' ? today : null, resolution: resolution || null, notes: notes || null,
  };
  db.prepare(`INSERT INTO tickets (id, customerId, category, subject, status, date, resolvedOn, resolution, notes)
    VALUES (@id, @customerId, @category, @subject, @status, @date, @resolvedOn, @resolution, @notes)`).run(ticket);
  return { ...ticket, reused: false };
}

function categoryFor(intent = '') {
  if (intent.includes('security') || intent === 'account') return 'security';
  if (intent.includes('payment')) return 'billing';
  if (intent.includes('refund')) return 'refund';
  if (intent.includes('order_status') || intent.includes('delivery')) return 'delivery';
  if (intent.includes('product')) return 'product';
  return 'general';
}

function executeActions({ customerId, analysis, rootCause, decision, investigation }) {
  const result = { executed: false, refund: null, ticket: null, skipped: null, error: null };
  try {
    const d = decision?.decision;
    const policy = rootCause?.matchedPolicy || null;
    const intent = analysis?.intent || '';
    const order = investigation?.focusOrder || null;
    const orderLabel = order ? order.id : 'N/A';

    db.transaction(() => {
      if (d === 'HUMAN_ESCALATION') {
        result.ticket = createTicket({
          customerId, category: categoryFor(intent), status: 'open',
          subject: `Escalated: ${intent || 'unknown'} | ${policy || 'no policy'} | ${orderLabel}`,
          notes: decision.reasoning,
        });
        return;
      }
      if (d !== 'AUTO_RESOLVE') return;

      const moneyPolicy = ['POLICY7', 'POLICY1', 'POLICY4', 'POLICY6'].includes(policy);
      if (moneyPolicy && (!order || order.customerId !== customerId)) {
        result.skipped = 'ORDER_NOT_VERIFIED_FOR_CUSTOMER';
        return;
      }

      let spec = null;
      const pays = (investigation.focusPayments || []).filter((p) => p.customerId === customerId && p.orderId === order?.id);

      if (policy === 'POLICY7') {
        const ok = pays.filter(isSuccess);
        if (ok.length >= 2) {
          const target = ok.find((p) => p.localStatus === 'failed')
            || [...ok].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
          if (refundCount(order.id, customerId, R.dup) >= ok.length - 1) result.skipped = 'ALREADY_REFUNDED';
          else spec = { amount: target.amount, reason: R.dup, gatewayRef: target.gatewayRef };
        } else result.skipped = 'DUPLICATE_NOT_CONFIRMED';
      } else if (policy === 'POLICY1') {
        const orphan = pays.find((p) => p.gatewayStatus === 'success' && p.localStatus === 'failed');
        if (!orphan) result.skipped = 'NO_ORPHAN_DEBIT';
        else if (refundCount(order.id, customerId, R.recon) > 0) result.skipped = 'ALREADY_REFUNDED';
        else spec = { amount: orphan.amount, reason: R.recon, gatewayRef: orphan.gatewayRef };
      } else if (policy === 'POLICY4') {
        if (anyRefundCount(order.id, customerId) > 0) result.skipped = 'REFUND_ALREADY_EXISTS';
        else spec = { amount: order.amount, reason: R.ret, gatewayRef: null };
      } else if (policy === 'POLICY6') {
        if (anyRefundCount(order.id, customerId) > 0) result.skipped = 'REFUND_ALREADY_EXISTS';
        else spec = { amount: order.amount, reason: R.dmg, gatewayRef: null };
      }

      if (result.skipped) return;

      if (spec) {
        result.refund = createRefund({ orderId: order.id, customerId, ...spec });
        result.ticket = createTicket({
          customerId, category: categoryFor(intent), status: 'resolved',
          subject: `Auto-resolved: ${policy} | ${order.id}`,
          resolution: `Refund ${result.refund.id} of INR ${spec.amount} initiated (pending bank settlement)`,
          notes: decision.reasoning,
        });
      } else {
        const isDelay = false; // delay compensation now goes through CUSTOMER_CONFIRM
        result.ticket = createTicket({
          customerId, category: categoryFor(intent), status: isDelay ? 'open' : 'resolved',
          subject: `Auto-resolved: ${policy || 'no policy'} | ${orderLabel}`,
          resolution: isDelay ? null : `Verified against backend records under ${policy}; no financial action required`,
          notes: isDelay ? 'Eligible for shipping credit or expedited redelivery per POLICY11; awaiting fulfilment' : decision.reasoning,
        });
      }
    })();

    result.executed = !!(result.refund || (result.ticket && !result.ticket.reused));
  } catch (err) {
    console.error('[actionExecutor] failed:', err.message);
    result.error = err.message;
  }
  return result;
}

module.exports = { executeActions, createTicket, createRefund };
