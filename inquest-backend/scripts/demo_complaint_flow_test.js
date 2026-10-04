require('dotenv').config();
const db = require('../src/db/connection');
const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const PW = process.env.ADMIN_PASSWORD;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function register(token, orderId, text, withPhoto) {
  const fd = new FormData();
  fd.append('orderId', orderId);
  fd.append('complaintText', text);
  if (withPhoto) fd.append('photos', new Blob([PNG], { type: 'image/png' }), 'evidence.png');
  const res = await fetch(BASE + '/me/complaints', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
  // --- admin session ---
  const noPw = await call('POST', '/admin/session', { adminPassword: 'wrong', employeeName: 'X Y', employeeEmail: 'x@y.com' });
  check('admin session rejects a wrong password', noPw.status === 401);
  const sess = await call('POST', '/admin/session', { adminPassword: PW, employeeName: 'Yash Gautam', employeeEmail: 'yash@example.com' });
  check('admin session issued', sess.status === 200 && !!sess.json.data.token);
  const A = { 'X-Admin-Token': sess.json.data.token };
  await call('POST', '/admin/settings', { autoInvestigate: false }, A);
  check('bad admin token rejected', (await call('POST', '/admin/complaints', {}, { 'X-Admin-Token': 'a'.repeat(64) })).status === 401);

  // --- customer ---
  const email = `flow${Date.now()}@example.com`;
  const su = await call('POST', '/auth/signup', { name: 'Flow Tester', email, password: 'Str0ng-pass-123' });
  const { token, customer } = su.json.data;
  const C = { Authorization: `Bearer ${token}` };
  const cid = customer.id;

  // A) duplicate payment: register -> investigate (dry run) -> admin confirms the AI
  const oA = (await call('POST', '/shop/orders', { productId: 'phone', quantity: 1, paymentMode: 'double_charge' }, C)).json.data.order.id;
  const rA = await register(token, oA, 'bhai payment 2 baar kat gyi, please jaldi fix karo', true);
  check('complaint registered with a photo', rA.status === 201 && rA.json.data.status === 'registered', 'complaint #' + (rA.json.data && rA.json.data.id));
  const idA = rA.json.data.id;
  const myA = (await call('GET', '/me/complaints', null, C)).json.data.find((c) => c.id === idA);
  check('customer sees "Registered"', myA && myA.status === 'registered' && myA.photoCount === 1);
  const listA = await call('POST', '/admin/complaints', { status: 'registered' }, A);
  check('admin sees it in the Registered list', listA.json.data.complaints.some((c) => c.id === idA), `registered: ${listA.json.data.counts.registered}`);
  const detA = await call('POST', '/admin/complaints/detail', { complaintId: idA }, A);
  check('admin detail includes the photo and customer', detA.json.data.photos.length === 1 && detA.json.data.photos[0].dataUrl.startsWith('data:image/png') && detA.json.data.customer.id === cid);
  check('admin got a NEW_COMPLAINT notification', (await call('POST', '/admin/notifications', {}, A)).json.data.notifications.some((n) => n.refId === idA && n.type === 'NEW_COMPLAINT'));

  const invA = await call('POST', '/admin/complaints/investigate', { complaintId: idA }, A);
  const dA = invA.json.data;
  check('investigation recommends AUTO_RESOLVE', invA.json.success && dA.decision.decision === 'AUTO_RESOLVE', dA && `${dA.decision.decision} (${dA.rootCause.matchedPolicy})`);
  check('result has an evidence graph', !!(dA && dA.evidenceGraph));
  check('DRY RUN: no refund created yet', db.prepare('SELECT COUNT(*) AS n FROM refunds WHERE orderId=?').get(oA).n === 0);
  const midA = (await call('GET', '/me/complaints', null, C)).json.data.find((c) => c.id === idA);
  check('customer sees "Under review" (not the AI verdict)', midA.status === 'in_review');

  const okA = await call('POST', '/admin/complaints/resolve', { complaintId: idA, action: 'CONFIRM_AI', note: 'Verified duplicate charge' }, A);
  check('admin confirms the AI recommendation', okA.json.success, okA.json.error);
  check('refund created only after confirmation', db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE orderId=? AND status != 'cancelled'").get(oA).n === 1);
  const endA = (await call('GET', '/me/complaints', null, C)).json.data.find((c) => c.id === idA);
  check('customer sees Resolved with the refund', endA.status === 'resolved' && /Refund/.test(endA.detail), endA.detail);
  check('resolving again is blocked (409)', (await call('POST', '/admin/complaints/resolve', { complaintId: idA, action: 'CONFIRM_AI' }, A)).status === 409);

  // B) damage claim without a photo -> AI escalates -> admin approves a refund
  const oB = (await call('POST', '/shop/orders', { productId: 'phone', quantity: 1, paymentMode: 'normal' }, C)).json.data.order.id;
  await call('POST', `/shop/orders/${oB}/simulate`, { action: 'deliver' }, C);
  const idB = (await register(token, oB, 'my phone arrived with a cracked broken screen, please refund', false)).json.data.id;
  const invB = await call('POST', '/admin/complaints/investigate', { complaintId: idB }, A);
  check('damage claim without photo: not auto-resolved (escalated or photo requested)', ['HUMAN_ESCALATION', 'NEEDS_INFO'].includes(invB.json.data.decision.decision), invB.json.data.decision.decision);
  check('AI-confirm is refused for an escalation', (await call('POST', '/admin/complaints/resolve', { complaintId: idB, action: 'CONFIRM_AI' }, A)).status === 409);
  check('refund above order value rejected', (await call('POST', '/admin/complaints/resolve', { complaintId: idB, action: 'REFUND', amount: 99999 }, A)).status === 400);
  const refB = await call('POST', '/admin/complaints/resolve', { complaintId: idB, action: 'REFUND', amount: 2000, customerMessage: 'Sorry about the damage!', note: 'Partial refund agreed' }, A);
  check('admin approves a partial refund', refB.json.success, refB.json.error);
  const endB = (await call('GET', '/me/complaints', null, C)).json.data.find((c) => c.id === idB);
  check('customer sees the staff message', endB.status === 'resolved' && /2,000/.test(endB.detail) && /Sorry/.test(endB.detail), endB.detail);

  // C) delay -> offer -> customer answers
  const oC = (await call('POST', '/shop/orders', { productId: 'earbuds', quantity: 1, paymentMode: 'normal' }, C)).json.data.order.id;
  await call('POST', `/shop/orders/${oC}/simulate`, { action: 'delay' }, C);
  const idC = (await register(token, oC, 'mera order abhi tak nahi aaya, delivery date nikal gayi', false)).json.data.id;
  const invC = await call('POST', '/admin/complaints/investigate', { complaintId: idC }, A);
  check('delay: AI proposes a customer offer', invC.json.data.decision.decision === 'CUSTOMER_CONFIRM', invC.json.data.decision.decision);
  const offC = await call('POST', '/admin/complaints/resolve', { complaintId: idC, action: 'SEND_OFFER' }, A);
  check('admin sends the offer', offC.json.success, offC.json.error);
  const awC = (await call('GET', '/me/complaints', null, C)).json.data.find((c) => c.id === idC);
  check('customer sees "Action needed" with options', awC.status === 'awaiting_you' && awC.proposal && awC.proposal.options.length >= 2);
  const ansC = await call('POST', '/complaints/confirm', { auditId: awC.proposal.auditId, choice: 'CREDIT' }, C);
  check('customer accepts the credit', ansC.json.success, ansC.json.error);
  const doneC = await call('POST', '/admin/complaints', { status: 'resolved' }, A);
  check('complaint marked resolved after the customer answers', doneC.json.data.complaints.some((c) => c.id === idC));

  // emails
  const mails = db.prepare('SELECT subject FROM email_outbox WHERE toEmail=?').all(email);
  check('emails sent to the customer\'s login address', mails.length >= 3 && mails.some((m) => /registered/.test(m.subject)), `${mails.length} emails: ${[...new Set(mails.map((m) => m.subject))].slice(0, 3).join(' | ')}`);

  await call('POST', '/admin/settings', { autoInvestigate: true }, A);
  const chain = await call('POST', '/admin/audit', { adminPassword: PW, limit: 1 });
  check('audit chain still valid', chain.json.data.chain.valid, JSON.stringify(chain.json.data.chain));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
