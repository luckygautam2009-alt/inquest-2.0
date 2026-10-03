const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '../../inquest.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables with full real schemas matching the json data structures
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    tier TEXT NOT NULL,
    joinedDate TEXT,
    joinedOn TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    product TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    deliveredAt TEXT,
    deliveredOn TEXT,
    returnRequested INTEGER NOT NULL DEFAULT 0,
    cancelledAt TEXT,
    cancellationReason TEXT,
    returnStatus TEXT,
    returnedAt TEXT,
    courierTracking TEXT,
    courierStatus TEXT,
    estimatedDelivery TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    customerId TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    gatewayStatus TEXT NOT NULL,
    localStatus TEXT NOT NULL,
    gatewayRef TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    category TEXT,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    date TEXT,
    resolvedOn TEXT,
    resolution TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    condition TEXT NOT NULL,
    eligibleWithinDays INTEGER,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    customerId TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    initiatedAt TEXT NOT NULL,
    completedAt TEXT,
    reason TEXT,
    gatewayRef TEXT
  );

  CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    ip TEXT,
    location TEXT,
    device TEXT,
    timestamp TEXT NOT NULL,
    flagged INTEGER NOT NULL DEFAULT 0,
    alert TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_profiles (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    employee_code TEXT NOT NULL UNIQUE,
    profile_photo TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Safe column migrations in case DB already exists from earlier run
function addColumnIfNotExists(table, column, type) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (err) {
    console.warn(`[db migration] Could not add column ${column} to ${table}:`, err.message);
  }
}

addColumnIfNotExists('customers', 'joinedDate', 'TEXT');
addColumnIfNotExists('orders', 'deliveredAt', 'TEXT');
addColumnIfNotExists('orders', 'cancelledAt', 'TEXT');
addColumnIfNotExists('orders', 'cancellationReason', 'TEXT');
addColumnIfNotExists('orders', 'returnStatus', 'TEXT');
addColumnIfNotExists('orders', 'returnedAt', 'TEXT');
addColumnIfNotExists('orders', 'courierTracking', 'TEXT');
addColumnIfNotExists('orders', 'courierStatus', 'TEXT');
addColumnIfNotExists('orders', 'estimatedDelivery', 'TEXT');
addColumnIfNotExists('payments', 'status', 'TEXT');
addColumnIfNotExists('payments', 'gatewayRef', 'TEXT');
addColumnIfNotExists('tickets', 'category', 'TEXT');
addColumnIfNotExists('tickets', 'date', 'TEXT');
addColumnIfNotExists('tickets', 'notes', 'TEXT');

function seedIfEmpty(table, jsonPath, insertSql, transform = (x) => x) {
  const count = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get().n;
  if (count === 0) {
    const data = require(jsonPath);
    const insert = db.prepare(insertSql);
    const run = db.transaction(() => data.forEach((row) => insert.run(transform(row))));
    run();
    console.log(`[db] Seeded ${table} (${data.length} rows)`);
  }
}

seedIfEmpty(
  'customers',
  '../mockData/customers.json',
  'INSERT OR IGNORE INTO customers (id, name, email, tier, joinedDate, joinedOn) VALUES (@id, @name, @email, @tier, @joinedDate, @joinedOn)',
  (c) => ({ joinedDate: c.joinedDate || c.joinedOn, joinedOn: c.joinedOn || c.joinedDate || new Date().toISOString().slice(0, 10), ...c })
);

seedIfEmpty(
  'orders',
  '../mockData/orders.json',
  'INSERT OR REPLACE INTO orders (id, customerId, product, amount, status, deliveredAt, deliveredOn, returnRequested, cancelledAt, cancellationReason, returnStatus, returnedAt, courierTracking, courierStatus, estimatedDelivery) VALUES (@id, @customerId, @product, @amount, @status, @deliveredAt, @deliveredOn, @returnRequested, @cancelledAt, @cancellationReason, @returnStatus, @returnedAt, @courierTracking, @courierStatus, @estimatedDelivery)',
  (o) => ({
    deliveredAt: null,
    deliveredOn: null,
    cancelledAt: null,
    cancellationReason: null,
    returnStatus: null,
    returnedAt: null,
    courierTracking: null,
    courierStatus: null,
    estimatedDelivery: null,
    ...o,
    returnRequested: o.returnRequested ? 1 : 0,
  })
);

seedIfEmpty(
  'payments',
  '../mockData/payments.json',
  'INSERT OR REPLACE INTO payments (id, orderId, customerId, amount, status, gatewayStatus, localStatus, gatewayRef, timestamp) VALUES (@id, @orderId, @customerId, @amount, @status, @gatewayStatus, @localStatus, @gatewayRef, @timestamp)',
  (p) => ({ status: p.status || p.gatewayStatus || 'success', gatewayRef: p.gatewayRef || null, ...p })
);

seedIfEmpty(
  'tickets',
  '../mockData/tickets.json',
  'INSERT OR REPLACE INTO tickets (id, customerId, category, subject, status, date, resolvedOn, resolution, notes) VALUES (@id, @customerId, @category, @subject, @status, @date, @resolvedOn, @resolution, @notes)',
  (t) => ({ category: t.category || null, date: t.date || null, resolvedOn: t.resolvedOn || null, resolution: t.resolution || null, notes: t.notes || null, ...t })
);

seedIfEmpty(
  'refunds',
  '../mockData/refunds.json',
  'INSERT OR REPLACE INTO refunds (id, orderId, customerId, amount, status, initiatedAt, completedAt, reason, gatewayRef) VALUES (@id, @orderId, @customerId, @amount, @status, @initiatedAt, @completedAt, @reason, @gatewayRef)',
  (r) => ({ completedAt: null, reason: null, gatewayRef: null, ...r })
);

seedIfEmpty(
  'security_events',
  '../mockData/securityEvents.json',
  'INSERT OR REPLACE INTO security_events (id, customerId, eventType, ip, location, device, timestamp, flagged, alert) VALUES (@id, @customerId, @eventType, @ip, @location, @device, @timestamp, @flagged, @alert)',
  (s) => ({ ip: null, location: null, device: null, alert: null, ...s, flagged: s.flagged ? 1 : 0 })
);

// Always resync default mockData orders if cancellation reasons or statuses were missing from old db
const initialOrders = require('../mockData/orders.json');
const updateOrderStmt = db.prepare(`
  UPDATE orders
  SET deliveredAt = @deliveredAt,
      deliveredOn = @deliveredOn,
      cancelledAt = @cancelledAt,
      cancellationReason = @cancellationReason,
      returnStatus = @returnStatus,
      returnedAt = @returnedAt,
      courierTracking = @courierTracking,
      courierStatus = @courierStatus,
      estimatedDelivery = @estimatedDelivery
  WHERE id = @id
`);
initialOrders.forEach((o) => {
  updateOrderStmt.run({
    id: o.id,
    deliveredAt: o.deliveredAt || null,
    deliveredOn: o.deliveredOn || null,
    cancelledAt: o.cancelledAt || null,
    cancellationReason: o.cancellationReason || null,
    returnStatus: o.returnStatus || null,
    returnedAt: o.returnedAt || null,
    courierTracking: o.courierTracking || null,
    courierStatus: o.courierStatus || null,
    estimatedDelivery: o.estimatedDelivery || null,
  });
});

// Policies are static config, not user data — always resync to latest
// definitions on startup rather than only seeding once.
const policies = require('../mockData/policies.json');
db.exec('DELETE FROM policies');
const insertPolicy = db.prepare('INSERT INTO policies (id, title, condition, eligibleWithinDays, description) VALUES (@id, @title, @condition, @eligibleWithinDays, @description)');
const resyncPolicies = db.transaction(() => {
  policies.forEach((p) => insertPolicy.run({ ...p, eligibleWithinDays: p.eligibleWithinDays ?? null }));
});
resyncPolicies();
console.log(`[db] Policies synced (${policies.length})`);

module.exports = db;
