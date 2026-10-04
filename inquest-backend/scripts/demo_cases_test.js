require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const PW = process.env.ADMIN_PASSWORD;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const admin = (path, body) => call('POST', path, { adminPassword: PW, ...body });
const staff = { employeeName: 'Yash Gautam', employeeEmail: 'yash@example.com' };

(async () => {
  const s = await call('POST', '/auth/signup', { name: 'Cases Tester', email: `cases${Date.now()}@example.com`, password: 'Str0ng-pass-123' });
  const { token, customer } = s.json.data;
  const cid = customer.id;

  // 1) A damage claim with no photo is escalated to humans
  const o1 = await call('POST', '/shop/orders', { productId: 'phone', quantity: 1, paymentMode: 'normal' }, token);
  const id1 = o1.json.data.order.id;
  await call('POST', `/shop/orders/${id1}/simulate`, { action: 'deliver' }, token);
  const c1 = await call('POST', '/complaints', { complaintText: `my order ${id1} phone arrived with a cracked broken screen, please refund` }, token);
  const audit1 = c1.json.data && c1.json.data.auditId;
  check('damage claim without photo is escalated', c1.json.success && c1.json.data.decision.decision === 'HUMAN_ESCALATION', c1.json.data && c1.json.data.decision.decision);

  const cases = await admin('/admin/cases', { customerId: cid });
  const k1 = cases.json.data.cases.find((c) => c.id === audit1);
  check('admin sees it as a case that needs attention', !!k1 && k1.status === 'needs_attention', k1 && k1.label);
  check('case has a timeline', !!k1 && k1.events.length >= 1);

  const an = await admin('/admin/notifications', { limit: 10 });
  check('admin got an escalation notification', an.json.data.notifications.some((n) => n.refId === audit1 && n.type === 'ESCALATION'), `${an.json.data.unread} unread, ${an.json.data.needsAttention} need attention`);

  const mineBefore = await call('GET', '/me/complaints', null, token);
  check('customer sees it as under review (no internal details)', mineBefore.json.data[0].status === 'in_review' && mineBefore.json.data[0].risk === undefined && mineBefore.json.data[0].policy === undefined);
  const nBefore = await call('GET', '/me/notifications', null, token);
  check('customer got a notification', nBefore.json.data.unread >= 1, nBefore.json.data.notifications[0] && nBefore.json.data.notifications[0].title);

  // 2) Staff resolves it with a refund
  const bad = await admin('/admin/override', { ...staff, auditId: audit1, type: 'RESOLVE', resolution: 'REFUND', amount: 999999, reason: 'too much' });
  check('refund above the order value is rejected', bad.status === 400 || bad.status === 409, bad.json.error);
  const ok = await admin('/admin/override', { ...staff, auditId: audit1, type: 'RESOLVE', resolution: 'REFUND', reason: 'Photo reviewed manually, screen is cracked', customerMessage: 'Sorry about that! Refund is on its way.' });
  check('staff resolves the case with a refund', ok.json.success && !!ok.json.data.changes.refund, ok.json.success ? ok.json.data.changes.refund.id + ' INR ' + ok.json.data.changes.refund.amount : ok.json.error);
  const again = await admin('/admin/override', { ...staff, auditId: audit1, type: 'RESOLVE', resolution: 'NO_REFUND', reason: 'second try should fail' });
  check('resolving twice is blocked (409)', again.status === 409, again.json.error);

  const orders = await call('GET', `/shop/orders/${cid}`, null, token);
  const ord1 = orders.json.data.find((o) => o.id === id1);
  check('customer order now shows Resolved with the refund', ord1.complaint.status === 'resolved' && /Refund/.test(ord1.complaint.detail), ord1.complaint.detail);
  check('refund row exists on the order', ord1.refunds.length === 1);
  const nAfter = await call('GET', '/me/notifications', null, token);
  check('customer notified about the resolution', nAfter.json.data.notifications.some((n) => /Resolved/.test(n.title) && n.severity === 'success'));

  const resolvedList = await admin('/admin/cases', { customerId: cid, status: 'resolved_by_staff' });
  check('case history lists it as resolved by staff', resolvedList.json.data.cases.length === 1 && resolvedList.json.data.cases[0].resolvedBy === 'Yash Gautam', resolvedList.json.data.cases[0] && resolvedList.json.data.cases[0].resolvedBy);

  // 3) A question that only needs an answer is NOT reported as "resolved"
  const o2 = await call('POST', '/shop/orders', { productId: 'earbuds', quantity: 1, paymentMode: 'normal' }, token);
  const id2 = o2.json.data.order.id;
  const c2 = await call('POST', '/complaints', { complaintText: `mera order ${id2} abhi tak nahi aaya, delivery date nikal gayi` }, token);
  const v = c2.json.data && c2.json.data.customerView;
  check('on-time order gets an honest answer, not "Resolved"', !!v && v.status === 'answered', v && v.detail);
  const orders2 = await call('GET', `/shop/orders/${cid}`, null, token);
  check('order stays reportable (status answered)', orders2.json.data.find((o) => o.id === id2).complaint.status === 'answered');

  const all = await admin('/admin/cases', { customerId: cid });
  console.log('\ncase counts:', JSON.stringify(all.json.data.counts));
  const chain = await admin('/admin/audit', { limit: 1 });
  check('audit chain still valid', chain.json.data.chain.valid, JSON.stringify(chain.json.data.chain));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
