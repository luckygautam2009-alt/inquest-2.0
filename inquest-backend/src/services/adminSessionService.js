const crypto = require('crypto');
const db = require('../db/connection');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    tokenHash TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );
`);

const HOURS = Number(process.env.ADMIN_SESSION_HOURS) || 12;
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

function create({ name, email }) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + HOURS * 3600000);
  db.prepare('DELETE FROM admin_sessions WHERE expiresAt < ?').run(now.toISOString());
  db.prepare('INSERT INTO admin_sessions (tokenHash, name, email, createdAt, expiresAt) VALUES (?,?,?,?,?)')
    .run(sha256(token), name, email, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

function verify(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token))) return null;
  const row = db.prepare('SELECT name, email, expiresAt FROM admin_sessions WHERE tokenHash=?').get(sha256(String(token).toLowerCase()));
  if (!row || row.expiresAt < new Date().toISOString()) return null;
  return { name: row.name, email: row.email };
}

function revoke(token) {
  db.prepare('DELETE FROM admin_sessions WHERE tokenHash=?').run(sha256(String(token).toLowerCase()));
}

module.exports = { create, verify, revoke };
