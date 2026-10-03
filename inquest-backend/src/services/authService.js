const crypto = require('crypto');
const db = require('../db/connection');

db.exec(`
  CREATE TABLE IF NOT EXISTS customer_auth (
    customerId TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    tokenHash TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customerId);
`);

const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Constant-ish work for unknown emails so response time does not reveal whether an account exists
const DUMMY_HASH = hashPassword('inquest-dummy-password');

function nextCustomerId() {
  let max = 999;
  for (const r of db.prepare('SELECT id FROM customers').all()) {
    const m = /^CUST(\d+)$/.exec(String(r.id));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CUST${max + 1}`;
}

function publicCustomer(c) {
  return { id: c.id, name: c.name, email: c.email, tier: c.tier, joinedOn: c.joinedOn };
}

function issueSession(customerId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions (tokenHash, customerId, createdAt, expiresAt) VALUES (?,?,?,?)')
    .run(sha256(token), customerId, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

function signup({ name, email, password }) {
  const e = String(email).trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM customer_auth WHERE email=?').get(e)) {
    return { status: 409, error: 'An account with this email already exists. Please sign in.' };
  }
  const today = new Date().toISOString().slice(0, 10);
  let customer;
  db.transaction(() => {
    const id = nextCustomerId();
    customer = { id, name: String(name).trim(), email: e, tier: 'silver', joinedDate: today, joinedOn: today };
    db.prepare('INSERT INTO customers (id, name, email, tier, joinedDate, joinedOn) VALUES (@id, @name, @email, @tier, @joinedDate, @joinedOn)').run(customer);
    db.prepare('INSERT INTO customer_auth (customerId, email, passwordHash, createdAt) VALUES (?,?,?,?)')
      .run(id, e, hashPassword(password), new Date().toISOString());
  })();
  return { status: 201, customer: publicCustomer(customer), ...issueSession(customer.id) };
}

function login({ email, password }) {
  const e = String(email).trim().toLowerCase();
  const auth = db.prepare('SELECT * FROM customer_auth WHERE email=?').get(e);
  const ok = verifyPassword(password, auth ? auth.passwordHash : DUMMY_HASH) && !!auth;
  if (!ok) return { status: 401, error: 'Invalid email or password' };
  const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(auth.customerId);
  if (!customer) return { status: 401, error: 'Invalid email or password' };
  return { status: 200, customer: publicCustomer(customer), ...issueSession(customer.id) };
}

function logout(token) {
  db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(sha256(token));
}

function customerFromToken(token) {
  const row = db.prepare(`
    SELECT c.id, c.name, c.email, c.tier, c.joinedOn, s.expiresAt
    FROM sessions s JOIN customers c ON c.id = s.customerId
    WHERE s.tokenHash = ?`).get(sha256(token));
  if (!row) return null;
  if (row.expiresAt < new Date().toISOString()) return null;
  return publicCustomer(row);
}

module.exports = { signup, login, logout, customerFromToken };
