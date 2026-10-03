require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/db/connection');

const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const PW = process.env.ADMIN_PASSWORD;
const photo = process.argv[2] || path.join(os.homedir(), 'Desktop', 'damaged.jpg');
const hasPhoto = fs.existsSync(photo);

const call = async (method, p, body) => (await fetch(BASE + p, {
  method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
})).json();

async function complaint(customerId, text, withPhoto) {
  if (!withPhoto) return call('POST', '/complaints', { customerId, complaintText: text });
  const fd = new FormData();
  fd.append('customerId', customerId);
  fd.append('complaintText', text);
  fd.append('photos', new Blob([fs.readFileSync(photo)], { type: 'image/jpeg' }), path.basename(photo));
  return (await fetch(BASE + '/complaints', { method: 'POST', body: fd })).json();
}

const rows = [];
function record(name, expected, d, extra) {
  const actual = d ? d.decision.decision : 'ERROR';
  const ok = actual === expected;
  rows.push({ name, expected, actual, policy: d ? d.rootCause.matchedPolicy : '-', ok, extra });
}

(async () => {
  // Photo hashes from earlier tests would make a first-time photo look "reused", so start clean
  try { db.prepare('DELETE FROM image_hashes').run(); } catch { /* table may not exist yet */ }

  const c = await call('POST', '/customers', { name: 'Pitch Demo', email: `pitch${Date.now()}@example.com`, tier: 'silver' });
  const cust = (c.data.customer || c.data).id;
  console.log(`\nINQUEST 2.0 pitch demo. Fresh customer: ${cust}\n`);

  // A: duplicate payment
  const a = await call('POST', '/shop/orders', { customerId: cust, productId: 'phone', quantity: 1, paymentMode: 'double_charge' });
  const ra = await complaint(cust, `bhai payment 2 baar kat gyi order ${a.data.order.id}, please jaldi fix karo`);
  record('A  Duplicate payment', 'AUTO_RESOLVE', ra.data, ra.data && ra.data.actions.refund ? `refund ${ra.data.actions.refund.id} INR ${ra.data.actions.refund.amount}` : 'no refund');

  // B + C: damaged item with photo, then the same photo again
  if (hasPhoto) {
    const b = await call('POST', '/shop/orders', { customerId: cust, productId: 'phone', quantity: 1, paymentMode: 'normal' });
    const bid = b.data.order.id;
    await call('POST', `/shop/orders/${bid}/simulate`, { customerId: cust, action: 'deliver' });
    const text = `my order ${bid} phone arrived with a cracked broken screen, please refund`;
    const rb = await complaint(cust, text, true);
    const v = rb.data && rb.data.photo && rb.data.photo.vision;
    record('B  Damaged item + photo', 'AUTO_RESOLVE', rb.data, rb.data && rb.data.actions.refund ? `refund ${rb.data.actions.refund.id}, vision ${v ? v.confidence + '%' : 'n/a'}` : 'no refund');
    const rc = await complaint(cust, text, true);
    record('C  Same photo reused', 'HUMAN_ESCALATION', rc.data, rc.data && rc.data.photo && rc.data.photo.reuse.detected ? 'image reuse caught by hash' : 'reuse NOT detected');
  } else {
    console.log(`(photo not found at ${photo}: cases B and C skipped)\n`);
  }

  // D: security concern
  const rd = await complaint(cust, 'someone accessed my account without my permission', false);
  record('D  Security concern', 'HUMAN_ESCALATION', rd.data, rd.data && rd.data.actions.ticket ? `ticket ${rd.data.actions.ticket.id} opened` : '');

  // E: delivery delay -> customer confirms credit
  const e = await call('POST', '/shop/orders', { customerId: cust, productId: 'earbuds', quantity: 1, paymentMode: 'normal' });
  await call('POST', `/shop/orders/${e.data.order.id}/simulate`, { customerId: cust, action: 'delay' });
  const re = await complaint(cust, `mera order ${e.data.order.id} abhi tak nahi aaya, delivery date nikal gayi`, false);
  let extra = '';
  if (re.data && re.data.proposal) {
    const ok = await call('POST', '/complaints/confirm', { auditId: re.data.proposal.auditId, customerId: cust, choice: 'CREDIT' });
    extra = ok.success ? ok.data.message : ok.error;
  }
  record('E  Delivery delay', 'CUSTOMER_CONFIRM', re.data, extra);

  console.log('Case                       Expected           Actual             Policy    Result');
  console.log('-'.repeat(92));
  rows.forEach((r) => console.log(`${r.name.padEnd(26)} ${r.expected.padEnd(18)} ${r.actual.padEnd(18)} ${String(r.policy).padEnd(9)} ${r.ok ? 'PASS' : 'FAIL'}   ${r.extra || ''}`));

  const log = await call('POST', '/admin/audit', { adminPassword: PW, limit: 1 });
  const an = await call('POST', '/admin/analytics', { adminPassword: PW });
  console.log('\nAudit chain      :', JSON.stringify(log.data.chain));
  console.log(`Auto-resolve rate: ${an.data.rates.autoResolvePct}% across ${an.data.totals.decisions} decisions`);
  console.log(`Passed           : ${rows.filter((r) => r.ok).length}/${rows.length}\n`);
})();
