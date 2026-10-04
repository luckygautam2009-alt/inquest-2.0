const crypto = require('crypto');
const db = require('../db/connection');
require('./auditService');
require('./proposalService');

const CATALOG = [
  { id: 'earbuds', name: 'Wireless Earbuds', price: 1499, emoji: '🎧', blurb: 'Bluetooth 5.3, 24h battery' },
  { id: 'sleeve', name: 'Laptop Sleeve', price: 899, emoji: '💼', blurb: 'Padded, water resistant' },
  { id: 'speaker', name: 'Bluetooth Speaker', price: 2199, emoji: '🔊', blurb: 'Portable, 12h playtime' },
  { id: 'watch', name: 'Smart Watch', price: 3499, emoji: '⌚', blurb: 'Heart-rate and sleep tracking' },
  { id: 'phone', name: 'Smartphone', price: 4500, emoji: '📱', blurb: '6.5" display, 4GB RAM' },
  { id: 'headphones', name: 'Noise-Cancelling Headphones', price: 4999, emoji: '🎶', blurb: 'Active noise cancelling' },
  { id: 'laptop', name: 'Premium Laptop', price: 54999, emoji: '\u{1F4BB}', blurb: 'High-value item: always needs human review' },
];

const MODES = ['normal', 'double_charge', 'gateway_glitch'];
const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

function nextNum(table, prefix, min) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = min - 1;
  for (const r of db.prepare(`SELECT id FROM ${table}`).all()) {
    const m = re.exec(String(r.id));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const gwRef = () => `gw_${crypto.randomBytes(5).toString('hex')}`;

function placeOrder({ customerId, productId, quantity, paymentMode }) {
  const product = CATALOG.find((p) => p.id === productId);
  if (!product) return { status: 400, error: 'Unknown product' };
  const qty = Number(quantity) || 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > 5) return { status: 400, error: 'quantity must be 1-5' };
  if (!MODES.includes(paymentMode)) return { status: 400, error: 'Invalid payment mode' };
  const customer = db.prepare('SELECT id FROM customers WHERE id=?').get(customerId);
  if (!customer) return { status: 404, error: `Customer not found: ${customerId}` };

  const total = product.price * qty;
  const glitch = paymentMode === 'gateway_glitch';
  const orderId = `ORDER${nextNum('orders', 'ORDER', 1001)}`;
  const order = {
    id: orderId, customerId,
    product: qty > 1 ? `${product.name} x${qty}` : product.name,
    amount: total,
    status: glitch ? 'pending' : 'in_transit',
    deliveredAt: null, deliveredOn: null, returnRequested: 0,
    cancelledAt: null, cancellationReason: null, returnStatus: null, returnedAt: null,
    courierTracking: glitch ? null : `TRK${crypto.randomInt(100000000, 999999999)}`,
    courierStatus: glitch ? null : 'dispatched',
    estimatedDelivery: glitch ? null : day(3),
  };

  const specs = paymentMode === 'double_charge'
    ? [{ status: 'success', gw: 'success', local: 'success' }, { status: 'success', gw: 'success', local: 'success' }]
    : glitch
      ? [{ status: 'failed', gw: 'success', local: 'failed' }]
      : [{ status: 'success', gw: 'success', local: 'success' }];

  const payments = [];
  db.transaction(() => {
    db.prepare(`INSERT INTO orders (id, customerId, product, amount, status, deliveredAt, deliveredOn, returnRequested,
      cancelledAt, cancellationReason, returnStatus, returnedAt, courierTracking, courierStatus, estimatedDelivery)
      VALUES (@id, @customerId, @product, @amount, @status, @deliveredAt, @deliveredOn, @returnRequested,
      @cancelledAt, @cancellationReason, @returnStatus, @returnedAt, @courierTracking, @courierStatus, @estimatedDelivery)`).run(order);
    let n = nextNum('payments', 'PAY', 1001);
    specs.forEach((s, i) => {
      const p = {
        id: `PAY${n++}`, orderId, customerId, amount: total, status: s.status,
        gatewayStatus: s.gw, localStatus: s.local, gatewayRef: gwRef(),
        timestamp: new Date(Date.now() + i * 2000).toISOString(),
      };
      db.prepare(`INSERT INTO payments (id, orderId, customerId, amount, status, gatewayStatus, localStatus, gatewayRef, timestamp)
        VALUES (@id, @orderId, @customerId, @amount, @status, @gatewayStatus, @localStatus, @gatewayRef, @timestamp)`).run(p);
      payments.push(p);
    });
  })();
  return { status: 201, order, payments };
}

const caseService = require('./caseService');

function listOrders(customerId) {
  const latest = caseService.latestByOrder(customerId);
  const orders = db.prepare('SELECT * FROM orders WHERE customerId=? ORDER BY rowid DESC').all(customerId);
  return orders.map((o) => {
    const c = latest.get(o.id);
    return {
      ...o,
      payments: db.prepare('SELECT * FROM payments WHERE orderId=? AND customerId=? ORDER BY timestamp ASC').all(o.id, customerId),
      refunds: db.prepare('SELECT * FROM refunds WHERE orderId=? AND customerId=? ORDER BY initiatedAt ASC').all(o.id, customerId),
      complaint: c ? { status: c.customerStatus, label: c.customerLabel, detail: c.customerDetail, auditId: c.id, proposal: c.proposal || undefined } : { status: 'none' },
    };
  });
}

function simulate({ orderId, customerId, action }) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!o || o.customerId !== customerId) return { status: 404, error: 'Order not found' };
  const now = new Date().toISOString();
  if (action === 'deliver') {
    if (o.status !== 'in_transit') return { status: 409, error: 'Only in-transit orders can be marked delivered' };
    db.prepare("UPDATE orders SET status='delivered', deliveredAt=?, deliveredOn=?, courierStatus='delivered' WHERE id=?").run(now, now.slice(0, 10), orderId);
  } else if (action === 'delay') {
    if (o.status !== 'in_transit') return { status: 409, error: 'Only in-transit orders can be delayed' };
    db.prepare("UPDATE orders SET estimatedDelivery=?, courierStatus='delayed' WHERE id=?").run(day(-3), orderId);
  } else if (action === 'cancel') {
    if (!['in_transit', 'pending'].includes(o.status)) return { status: 409, error: 'Only pending or in-transit orders can be cancelled' };
    db.prepare("UPDATE orders SET status='cancelled', cancelledAt=?, cancellationReason='Customer requested cancellation before delivery' WHERE id=?").run(now, orderId);
  } else {
    return { status: 400, error: 'action must be deliver, delay or cancel' };
  }
  return { status: 200, order: db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) };
}

module.exports = { CATALOG, placeOrder, listOrders, simulate };
