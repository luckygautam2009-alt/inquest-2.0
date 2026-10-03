require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const call = async (method, path, body) => (await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();

async function delayedOrder(custId, productId) {
  const o = await call('POST', '/shop/orders', { customerId: custId, productId, quantity: 1, paymentMode: 'normal' });
  const id = o.data.order.id;
  await call('POST', `/shop/orders/${id}/simulate`, { customerId: custId, action: 'delay' });
  return id;
}

(async () => {
  const c = await call('POST', '/customers', { name: 'Confirm Tester', email: `ct${Date.now()}@example.com`, tier: 'silver' });
  const cust = (c.data.customer || c.data).id;

  // 1) Delay -> CUSTOMER_CONFIRM -> accept credit
  const id1 = await delayedOrder(cust, 'phone');
  const r1 = await call('POST', '/complaints', { customerId: cust, complaintText: `mera order ${id1} abhi tak nahi aaya, delivery date nikal gayi` });
  if (!r1.success) return console.log('ERROR', r1.error);
  console.log(`\n1) ${id1}: ${r1.data.decision.decision} (${r1.data.rootCause.matchedPolicy}) audit #${r1.data.auditId}`);
  const p = r1.data.proposal;
  console.log('   proposal :', p ? p.summary : 'NONE');
  if (!p) return console.log('   -> no proposal created, paste this output');
  p.options.forEach((o) => console.log(`     - ${o.key}: ${o.label}`));
  const a1 = await call('POST', '/complaints/confirm', { auditId: p.auditId, customerId: cust, choice: 'CREDIT' });
  console.log('   CREDIT   :', a1.success ? a1.data.message : a1.error);
  const a2 = await call('POST', '/complaints/confirm', { auditId: p.auditId, customerId: cust, choice: 'CREDIT' });
  console.log('   again    :', a2.success ? 'BAD: allowed twice' : a2.error, '(must fail)');

  // 2) Delay -> expedite
  const id2 = await delayedOrder(cust, 'earbuds');
  const r2 = await call('POST', '/complaints', { customerId: cust, complaintText: `mera order ${id2} abhi tak nahi aaya, delivery date nikal gayi` });
  console.log(`\n2) ${id2}: ${r2.data.decision.decision} (${r2.data.rootCause.matchedPolicy})`);
  if (r2.data.proposal) {
    const e = await call('POST', '/complaints/confirm', { auditId: r2.data.proposal.auditId, customerId: cust, choice: 'EXPEDITE' });
    console.log('   EXPEDITE :', e.success ? e.data.message : e.error);
  }

  // 3) Wrong customer cannot answer someone else's proposal
  const bad = await call('POST', '/complaints/confirm', { auditId: p.auditId, customerId: 'CUST001', choice: 'DECLINE' });
  console.log('\n3) other customer:', bad.success ? 'BAD: allowed' : bad.error, '(must fail)');

  const list = await call('GET', `/shop/orders/${cust}`);
  console.log('\nOrders now:');
  list.data.forEach((o) => console.log(`  ${o.id} ${o.status} ${o.courierStatus || '-'} ETA ${o.estimatedDelivery || '-'} refunds: ${o.refunds.map((r) => r.id + ' INR ' + r.amount).join(', ') || '-'}`));
  const log = await call('POST', '/admin/audit', { adminPassword: process.env.ADMIN_PASSWORD, limit: 3 });
  console.log('\naudit chain:', JSON.stringify(log.data.chain), '| latest:', log.data.entries[0].entryType, log.data.entries[0].decision);
})();
