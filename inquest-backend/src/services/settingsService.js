const db = require('../db/connection');

db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL)');

function get(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}

function set(key, value) {
  db.prepare('INSERT INTO settings (key, value, updatedAt) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt')
    .run(key, String(value), new Date().toISOString());
}

module.exports = { get, set };
