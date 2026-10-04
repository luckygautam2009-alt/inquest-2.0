const db = require('../db/connection');

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audience TEXT NOT NULL,
    customerId TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    refId INTEGER,
    severity TEXT NOT NULL DEFAULT 'info',
    createdAt TEXT NOT NULL,
    readAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_lookup ON notifications(audience, customerId, readAt);
`);

function notify({ audience, customerId = null, type, title, body = null, refId = null, severity = 'info' }) {
  try {
    db.prepare('INSERT INTO notifications (audience, customerId, type, title, body, refId, severity, createdAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(audience, audience === 'customer' ? customerId : null, type, title, body, refId, severity, new Date().toISOString());
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

function scope(audience, customerId) {
  return audience === 'customer'
    ? { sql: 'audience = ? AND customerId = ?', args: ['customer', customerId] }
    : { sql: 'audience = ?', args: ['admin'] };
}

function list({ audience, customerId = null, limit = 30 }) {
  const s = scope(audience, customerId);
  return db.prepare(`SELECT * FROM notifications WHERE ${s.sql} ORDER BY id DESC LIMIT ?`).all(...s.args, limit);
}

function unreadCount({ audience, customerId = null }) {
  const s = scope(audience, customerId);
  return db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${s.sql} AND readAt IS NULL`).get(...s.args).n;
}

function markRead({ audience, customerId = null, ids = null }) {
  const s = scope(audience, customerId);
  const now = new Date().toISOString();
  if (Array.isArray(ids)) {
    const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    if (!clean.length) return 0;
    return db.prepare(`UPDATE notifications SET readAt = ? WHERE ${s.sql} AND readAt IS NULL AND id IN (${clean.map(() => '?').join(',')})`)
      .run(now, ...s.args, ...clean).changes;
  }
  return db.prepare(`UPDATE notifications SET readAt = ? WHERE ${s.sql} AND readAt IS NULL`).run(now, ...s.args).changes;
}

module.exports = { notify, list, unreadCount, markRead };
