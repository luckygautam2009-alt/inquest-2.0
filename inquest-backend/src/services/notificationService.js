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
const cols = db.prepare('PRAGMA table_info(notifications)').all().map((c) => c.name);
if (!cols.includes('dedupeKey')) db.exec('ALTER TABLE notifications ADD COLUMN dedupeKey TEXT');
if (!cols.includes('dismissedAt')) db.exec('ALTER TABLE notifications ADD COLUMN dismissedAt TEXT');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(audience, COALESCE(customerId,''), dedupeKey) WHERE dedupeKey IS NOT NULL");

// States: UNREAD (readAt null) -> READ (readAt set) -> DISMISSED (dismissedAt set, never listed again)
function notify({ audience, customerId = null, type, title, body = null, refId = null, severity = 'info', dedupeKey = null }) {
  try {
    const r = db.prepare('INSERT OR IGNORE INTO notifications (audience, customerId, type, title, body, refId, severity, createdAt, dedupeKey) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(audience, audience === 'customer' ? customerId : null, type, title, body, refId, severity, new Date().toISOString(), dedupeKey);
    return r.changes > 0;
  } catch (err) {
    console.error('[notify] failed:', err.message);
    return false;
  }
}

function scope(audience, customerId) {
  return audience === 'customer'
    ? { sql: 'audience = ? AND customerId = ?', args: ['customer', customerId] }
    : { sql: 'audience = ?', args: ['admin'] };
}

function list({ audience, customerId = null, limit = 30 }) {
  const s = scope(audience, customerId);
  return db.prepare(`SELECT * FROM notifications WHERE ${s.sql} AND dismissedAt IS NULL ORDER BY id DESC LIMIT ?`).all(...s.args, limit);
}

function unreadCount({ audience, customerId = null }) {
  const s = scope(audience, customerId);
  return db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${s.sql} AND readAt IS NULL AND dismissedAt IS NULL`).get(...s.args).n;
}

const cleanIds = (ids) => ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);

function markRead({ audience, customerId = null, ids = null }) {
  const s = scope(audience, customerId);
  const now = new Date().toISOString();
  if (Array.isArray(ids)) {
    const clean = cleanIds(ids);
    if (!clean.length) return 0;
    return db.prepare(`UPDATE notifications SET readAt = ? WHERE ${s.sql} AND readAt IS NULL AND dismissedAt IS NULL AND id IN (${clean.map(() => '?').join(',')})`)
      .run(now, ...s.args, ...clean).changes;
  }
  return db.prepare(`UPDATE notifications SET readAt = ? WHERE ${s.sql} AND readAt IS NULL AND dismissedAt IS NULL`).run(now, ...s.args).changes;
}

// Dismissing is stored in the database and is scoped to the owner, so it can never touch another customer's rows
function dismiss({ audience, customerId = null, ids = null }) {
  const s = scope(audience, customerId);
  const now = new Date().toISOString();
  if (Array.isArray(ids)) {
    const clean = cleanIds(ids);
    if (!clean.length) return 0;
    return db.prepare(`UPDATE notifications SET dismissedAt = ?, readAt = COALESCE(readAt, ?) WHERE ${s.sql} AND dismissedAt IS NULL AND id IN (${clean.map(() => '?').join(',')})`)
      .run(now, now, ...s.args, ...clean).changes;
  }
  return db.prepare(`UPDATE notifications SET dismissedAt = ?, readAt = COALESCE(readAt, ?) WHERE ${s.sql} AND dismissedAt IS NULL`).run(now, now, ...s.args).changes;
}

module.exports = { notify, list, unreadCount, markRead, dismiss };
