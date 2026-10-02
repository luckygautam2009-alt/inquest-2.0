require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const call = async (method, path, body) => (await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();

(async () => {
  const c = await call('POST', '/customers', { name: 'Demo Shopper', email: `demo${Date.now()}@example.com`, tier: 'silver' });
  const cust = c.data.customer || c.data;
  console.log('customer :', cust.id);

  const o1 = await call('POST', '/shop/orders', { customerId: cust.id, productId: 'phone', quantity: 1, paymentMode: 'double_charge' });
  const id1 = o1.data.order.id;
  console.log(`order 1  : ${id1} ${o1.data.order.product} INR ${o1.data.order.amount} ${o1.data.order.status}, payments: ${o1.data.payments.length}`);

  const r1 = await call('POST', '/complaints', { customerId: cust.id, complaintText: `bhai payment 2 baar kat gyi order ${id1}, please jaldi fix karo` });
  if (!r1.success) return console.log('complaint 1 ERROR', r1.error);
  console.log(`  -> ${r1.data.decision.decision} (${r1.data.rootCause.matchedPolicy}) refund: ${r1.data.actions.refund ? r1.data.actions.refund.id + ' INR ' + r1.data.actions.refund.amount : 'none'}`);

  const o2 = await call('POST', '/shop/orders', { customerId: cust.id, productId: 'earbuds', quantity: 1, paymentMode: 'gateway_glitch' });
  const id2 = o2.data.order.id;
  console.log(`order 2  : ${id2} ${o2.data.order.product} ${o2.data.order.status} (gateway debited, local failed)`);
  const r2 = await call('POST', '/complaints', { customerId: cust.id, complaintText: `payment kat gya but my order ${id2} did not go through, please refund` });
  if (!r2.success) return console.log('complaint 2 ERROR', r2.error);
  console.log(`  -> ${r2.data.decision.decision} (${r2.data.rootCause.matchedPolicy}) refund: ${r2.data.actions.refund ? r2.data.actions.refund.id + ' INR ' + r2.data.actions.refund.amount : 'none'}`);

  const d = await call('POST', `/shop/orders/${id1}/simulate`, { customerId: cust.id, action: 'deliver' });
  console.log('deliver  :', d.success ? `${id1} -> ${d.data.status}` : d.error);

  const list = await call('GET', `/shop/orders/${cust.id}`);
  console.log('\nMy orders:');
  list.data.forEach((o) => console.log(`  ${o.id}  ${o.product}  ${o.status}  payments=${o.payments.length}  refunds=${o.refunds.map((r) => r.id + ':' + r.status).join(',') || '-'}`));
})();
