require('dotenv').config();
const db = require('../src/db/connection');
const BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const PW = process.env.ADMIN_PASSWORD;
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function multipart(path, token, fields, fileBuf, mime = 'image/png', name = 'evidence.png') {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, v); });
  if (fileBuf) fd.append('photos', new Blob([fileBuf], { type: mime }), name);
  const res = await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
  const sess = await call('POST', '/admin/session', { adminPassword: PW, employeeName: 'Yash Gautam', employeeEmail: 'yash@example.com' });
  const A = { 'X-Admin-Token': sess.json.data.token };
  const st = await call('POST', '/admin/settings', { autoInvestigate: true }, A);
  check('automation switched ON', st.json.data.autoInvestigate === true, JSON.stringify(st.json.data.thresholds));

  const su = async (n) => (await call('POST', '/auth/signup', { name: n, email: `${n.replace(/\W/g, '').toLowerCase()}${Date.now()}@example.com`, password: 'Str0ng-pass-123' })).json.data;
  const u1 = await su('Auto Tester');
  const C = { Authorization: `Bearer ${u1.token}` };
  const cid = u1.customer.id;
  const order = async (productId, paymentMode, sim) => {
    const id = (await call('POST', '/shop/orders', { productId, quantity: 1, paymentMode }, C)).json.data.order.id;
    if (sim) await call('POST', `/shop/orders/${id}/simulate`, { action: sim }, C);
    return id;
  };
  const mine = async () => (await call('GET', '/me/complaints', null, C)).json.data;
  const waitFor = async (id, pred, ms = 150000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const c = (await mine()).find((x) => x.id === id); if (c && pred(c)) return c; await sleep(2500); }
    return null;
  };
  const reg = async (orderId, text, withPhoto) => (await multipart('/me/complaints', u1.token, { orderId, complaintText: text }, withPhoto ? PNG : null)).json.data.id;

  // register all complaints first; the platform works through them in the background
  const o1 = await order('phone', 'double_charge');
  const o2 = await order('earbuds', 'gateway_glitch');
  const o3 = await order('earbuds', 'normal', 'delay');
  const o4 = await order('phone', 'normal', 'deliver');
  const o5 = await order('laptop', 'double_charge');
  const c1 = await reg(o1, 'bhai payment 2 baar kat gyi, please jaldi fix karo', true);
  const c2 = await reg(o2, 'payment kat gya but my order did not go through, please refund', false);
  const c3 = await reg(o3, 'mera order abhi tak nahi aaya, delivery date nikal gayi', false);
  const c4 = await reg(o4, 'my phone arrived with a cracked broken screen, please refund', false);
  const c5 = await reg(o5, 'bhai payment 2 baar kat gyi, please jaldi fix karo', false);
  const c6 = await reg('', 'my payment got deducted twice please fix', false);
  check('six complaints registered', [c1, c2, c3, c4, c5, c6].every(Boolean), [c1, c2, c3, c4, c5, c6].join(', '));
  check('customer sees them as registered/being checked right away', (await mine()).length === 6);

  // 1. duplicate payment -> resolved automatically, real refund
  const r1 = await waitFor(c1, (c) => c.status !== 'registered');
  check('duplicate payment: AUTO-RESOLVED with a refund', !!r1 && r1.status === 'resolved' && /Refund/.test(r1.detail), r1 && r1.detail);
  check('refund really exists for it', db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE orderId=? AND status != 'cancelled'").get(o1).n === 1);

  // 2. gateway debit with failed order
  const r2 = await waitFor(c2, (c) => c.status !== 'registered');
  check('debited-but-failed: AUTO-RESOLVED with a refund', !!r2 && r2.status === 'resolved' && /Refund/.test(r2.detail), r2 && r2.detail);

  // 3. delay -> automatic offer, customer answers
  const r3 = await waitFor(c3, (c) => c.status !== 'registered');
  check('delay: customer is offered a remedy (no admin needed)', !!r3 && r3.status === 'awaiting_you' && r3.proposal && r3.proposal.options.length >= 2, r3 && r3.status);
  if (r3 && r3.proposal) {
    const ans = await call('POST', '/complaints/confirm', { auditId: r3.proposal.auditId, choice: 'CREDIT' }, C);
    check('customer accepts the credit', ans.json.success, ans.json.error);
  }

  // 4. damage without a photo -> asks for a photo instead of escalating
  const r4 = await waitFor(c4, (c) => c.status !== 'registered');
  check('damage without photo: customer is asked for a photo', !!r4 && r4.status === 'needs_info' && /photo/i.test(r4.detail) && r4.canReply, r4 && r4.detail);

  // 5. high value -> human review, no money moved
  const r5 = await waitFor(c5, (c) => c.status !== 'registered');
  const d5 = (await call('POST', '/admin/complaints/detail', { complaintId: c5 }, A)).json.data;
  check('INR 54,999 duplicate payment: NOT auto-resolved (human review)', !!r5 && r5.status === 'in_review' && d5.complaint.status === 'human_review', d5.complaint.decisionReason);
  check('no refund was created for it', db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE orderId=?").get(o5).n === 0);
  check('stored gates explain why', Array.isArray(d5.complaint.automation && d5.complaint.automation.gates) && d5.complaint.automation.gates.some((g) => g.ok === false));

  // 6. no order mentioned -> asks which order
  const r6 = await waitFor(c6, (c) => c.status !== 'registered');
  check('no order mentioned: customer is asked for the order', !!r6 && r6.status === 'needs_info' && /order/i.test(r6.detail), r6 && r6.detail);

  // customer answers the request for a photo -> investigated again
  const rep = await multipart(`/me/complaints/${c4}/reply`, u1.token, { message: 'Here is the photo of my phone' }, PNG);
  check('customer replies to the information request', rep.status === 200, rep.json.error);
  const r4b = await waitFor(c4, (c) => c.status !== 'needs_info' && c.status !== 'registered');
  check('complaint is investigated again after the reply', !!r4b, r4b && `${r4b.status}: ${r4b.detail}`);

  // admin dashboard numbers come from real records
  const list = await call('POST', '/admin/complaints', {}, A);
  const mineIds = [c1, c2, c3, c4, c5, c6];
  const rows = list.json.data.complaints.filter((c) => mineIds.includes(c.id));
  check('admin list shows AI decision and confidence', rows.every((c) => c.decision && c.confidence !== null), rows.map((c) => `#${c.id}:${c.status}/${c.decision}/${c.confidence}`).join(' '));
  const s = list.json.data.summary;
  check('summary counts match the database', s.total === db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n && s.autoResolved === db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE status='auto_resolved'").get().n, JSON.stringify(s));
  check('"needs attention" filter returns the human-review case', (await call('POST', '/admin/complaints', { status: 'attention' }, A)).json.data.complaints.some((c) => c.id === c5));

  // notifications: no duplicates, important ones only, persistent clear
  const n1 = (await call('GET', '/me/notifications', null, C)).json.data;
  const forC1 = n1.notifications.filter((n) => n.refId === c1);
  check('no duplicate notifications for one complaint', forC1.length === 2, forC1.map((n) => n.title).join(' | '));
  const u2 = await su('Other Person');
  await multipart('/me/complaints', u2.token, { complaintText: 'where is my refund for my last order' }, null);
  const C2 = { Authorization: `Bearer ${u2.token}` };
  const before = n1.unread;
  const one = n1.notifications.find((n) => !n.readAt);
  const dis1 = await call('POST', '/me/notifications/dismiss', { ids: [one.id] }, C);
  const n2 = (await call('GET', '/me/notifications', null, C)).json.data;
  check('clearing one removes it and lowers the unread badge', dis1.json.data.changed === 1 && !n2.notifications.some((n) => n.id === one.id) && n2.unread === before - 1, `unread ${before} -> ${n2.unread}`);
  await call('POST', '/me/notifications/read', {}, C);
  check('mark all read sets unread to 0 but keeps the rest', (await call('GET', '/me/notifications', null, C)).json.data.unread === 0);
  const disAll = await call('POST', '/me/notifications/dismiss', { all: true }, C);
  const n3 = (await call('GET', '/me/notifications', null, C)).json.data;
  check('clear all empties the list', disAll.json.success && n3.notifications.length === 0 && n3.unread === 0);
  const relog = await call('POST', '/auth/login', { email: u1.customer.email, password: 'Str0ng-pass-123' });
  const n4 = (await call('GET', '/me/notifications', null, { Authorization: `Bearer ${relog.json.data.token}` })).json.data;
  check('cleared notifications stay cleared after signing in again', n4.notifications.length === 0);
  const other = (await call('GET', '/me/notifications', null, C2)).json.data;
  check('another customer\'s notifications are untouched', other.notifications.length >= 1, `${other.notifications.length} remain`);

  // photos: real image check + access control
  const fake = await multipart('/me/complaints', u1.token, { orderId: o1, complaintText: 'this is a fake photo test' }, Buffer.from('this is not an image at all'), 'image/png', 'fake.png');
  check('a text file renamed to .png is rejected', fake.status === 400, fake.json.error);
  const d1 = (await call('POST', '/admin/complaints/detail', { complaintId: c1 }, A)).json.data;
  const fid = d1.photos[0].id;
  const adminFile = await fetch(`${BASE}/admin/complaints/${c1}/files/${fid}`, { headers: A });
  check('admin can open the photo (authenticated)', adminFile.status === 200 && adminFile.headers.get('content-type') === 'image/png');
  check('no admin token: photo refused', (await fetch(`${BASE}/admin/complaints/${c1}/files/${fid}`)).status === 401);
  check('owner can open own photo', (await fetch(`${BASE}/me/complaints/${c1}/files/${fid}`, { headers: C })).status === 200);
  check('another customer cannot open it', (await fetch(`${BASE}/me/complaints/${c1}/files/${fid}`, { headers: C2 })).status === 404);

  // admin can still resolve the human-review case
  const done5 = await call('POST', '/admin/complaints/resolve', { complaintId: c5, action: 'REFUND', amount: 54999, note: 'Verified both charges', customerMessage: 'Refund approved by our team.' }, A);
  check('admin approves the high-value refund', done5.json.success, done5.json.error);
  const fin5 = (await mine()).find((c) => c.id === c5);
  check('customer sees it resolved with the team message', fin5.status === 'resolved' && /Refund/.test(fin5.detail), fin5.detail);

  const chain = await call('POST', '/admin/audit', { adminPassword: PW, limit: 1 });
  check('audit chain still valid', chain.json.data.chain.valid, JSON.stringify(chain.json.data.chain));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
