require('dotenv').config();
const db = require('../src/db/connection');
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

(async () => {
  const email = `auth${Date.now()}@example.com`;
  const password = 'Str0ng-pass-123';

  const s = await call('POST', '/auth/signup', { name: 'Auth Tester', email, password });
  check('signup creates account + customer id', s.status === 201 && /^CUST\d+$/.test(s.json.data && s.json.data.customer.id), s.json.data && s.json.data.customer.id);
  const { token, customer } = s.json.data;

  const row = db.prepare('SELECT passwordHash FROM customer_auth WHERE customerId=?').get(customer.id);
  check('password stored hashed (never plain text)', row && row.passwordHash.startsWith('scrypt$') && !row.passwordHash.includes(password));
  const cRow = db.prepare('SELECT id, name, email FROM customers WHERE id=?').get(customer.id);
  check('customer row saved to database automatically', !!cRow && cRow.email === email);

  check('weak password rejected', (await call('POST', '/auth/signup', { name: 'X Y', email: `w${Date.now()}@example.com`, password: 'short' })).status === 400);
  check('duplicate email rejected (409)', (await call('POST', '/auth/signup', { name: 'Auth Tester', email: email.toUpperCase(), password })).status === 409);
  check('wrong password rejected (401)', (await call('POST', '/auth/login', { email, password: 'wrong-password-1' })).status === 401);
  check('unknown email gets the same 401', (await call('POST', '/auth/login', { email: 'nobody@example.com', password })).status === 401);

  const l = await call('POST', '/auth/login', { email, password });
  check('login works, same customer id', l.status === 200 && l.json.data.customer.id === customer.id);
  const me = await call('GET', '/auth/me', null, l.json.data.token);
  check('/auth/me returns the signed-in customer', me.status === 200 && me.json.data.id === customer.id);
  check('bad token rejected (401)', (await call('GET', '/auth/me', null, 'a'.repeat(64))).status === 401);

  // Spoofing: signed-in customer tries to act as CUST001
  const o = await call('POST', '/shop/orders', { customerId: 'CUST001', productId: 'earbuds', quantity: 1, paymentMode: 'double_charge' }, token);
  check('order saved under the signed-in customer (spoofed id ignored)', o.status === 201 && o.json.data.order.customerId === customer.id, o.json.data && o.json.data.order.id);
  const pay = db.prepare('SELECT COUNT(*) AS n FROM payments WHERE orderId=? AND customerId=?').get(o.json.data.order.id, customer.id).n;
  check('payment records saved automatically (double charge = 2)', pay === 2, `${pay} payments`);

  check('cannot read another customer\'s orders (403)', (await call('GET', '/shop/orders/CUST001', null, token)).status === 403);
  const mine = await call('GET', `/shop/orders/${customer.id}`, null, token);
  check('own orders listed', mine.status === 200 && mine.json.data.length === 1);

  const c = await call('POST', '/complaints', { customerId: 'CUST001', complaintText: `bhai payment 2 baar kat gyi order ${o.json.data.order.id}, please jaldi fix karo` }, token);
  const audit = await call('POST', '/admin/audit', { adminPassword: PW, limit: 1 });
  check('complaint attributed to the signed-in customer, not CUST001', c.json.success && audit.json.data.entries[0].customerId === customer.id,
    c.json.success ? `${c.json.data.decision.decision}, audit customer ${audit.json.data.entries[0].customerId}` : c.json.error);

  const lo = await call('POST', '/auth/logout', null, token);
  check('logout works', lo.status === 200);
  check('token dead after logout (401)', (await call('GET', '/auth/me', null, token)).status === 401);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
