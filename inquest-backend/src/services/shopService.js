const crypto = require('crypto');
const db = require('../db/connection');
require('./auditService');
require('./proposalService');

const CATALOG = [
  { id: 'earbuds', name: 'Wireless Earbuds', price: 1499, emoji: '\u{1F3A7}', category: 'Audio', blurb: 'Bluetooth 5.3, 24h battery' },
  { id: 'headphones', name: 'Noise-Cancelling Headphones', price: 4999, emoji: '\u{1F3B6}', category: 'Audio', blurb: 'Active noise cancelling' },
  { id: 'speaker', name: 'Bluetooth Speaker', price: 2199, emoji: '\u{1F50A}', category: 'Audio', blurb: 'Portable, 12h playtime' },
  { id: 'soundbar', name: 'Mini Soundbar', price: 3799, emoji: '\u{1F4FB}', category: 'Audio', blurb: '2.1 channel, HDMI ARC' },
  { id: 'watch', name: 'Smart Watch', price: 3499, emoji: '\u231A', category: 'Wearables', blurb: 'Heart-rate and sleep tracking' },
  { id: 'band', name: 'Fitness Band', price: 1799, emoji: '\u{1F3C3}', category: 'Wearables', blurb: 'Steps, sleep and SpO2' },
  { id: 'phone', name: 'Smartphone', price: 4500, emoji: '\u{1F4F1}', category: 'Phones', blurb: '6.5" display, 4GB RAM' },
  { id: 'phonepro', name: 'Smartphone Pro', price: 17999, emoji: '\u{1F4F2}', category: 'Phones', blurb: '128GB, AMOLED display' },
  { id: 'powerbank', name: 'Power Bank 10000mAh', price: 1299, emoji: '\u{1F50B}', category: 'Phones', blurb: 'Fast charging, USB-C' },
  { id: 'charger', name: '65W GaN Charger', price: 1599, emoji: '\u{1F50C}', category: 'Phones', blurb: 'Charges phone and laptop' },
  { id: 'laptop', name: 'Premium Laptop', price: 54999, emoji: '\u{1F4BB}', category: 'Computing', blurb: 'High-value item: always needs human review' },
  { id: 'sleeve', name: 'Laptop Sleeve', price: 899, emoji: '\u{1F4BC}', category: 'Computing', blurb: 'Padded, water resistant' },
  { id: 'keyboard', name: 'Mechanical Keyboard', price: 2999, emoji: '\u2328\uFE0F', category: 'Computing', blurb: 'Hot-swappable, RGB' },
  { id: 'mouse', name: 'Wireless Mouse', price: 799, emoji: '\u{1F5B1}\uFE0F', category: 'Computing', blurb: 'Silent clicks, 18 month battery' },
  { id: 'webcam', name: 'Full HD Webcam', price: 1999, emoji: '\u{1F4F7}', category: 'Computing', blurb: '1080p with noise-reducing mic' },
  { id: 'monitor', name: '24-inch Monitor', price: 9999, emoji: '\u{1F5A5}\uFE0F', category: 'Computing', blurb: 'Full HD IPS, 75Hz' },
  { id: 'tv', name: 'Smart TV 32-inch', price: 14999, emoji: '\u{1F4FA}', category: 'Home', blurb: 'HD, built-in streaming apps' },
  { id: 'router', name: 'Wi-Fi 6 Router', price: 1599, emoji: '\u{1F4E1}', category: 'Home', blurb: 'Dual band, covers 1500 sq ft' },
  { id: 'lamp', name: 'LED Desk Lamp', price: 1099, emoji: '\u{1F4A1}', category: 'Home', blurb: 'Dimmable, eye-care light' },
  { id: 'coffee', name: 'Coffee Maker', price: 3299, emoji: '\u2615', category: 'Home', blurb: '12-cup programmable' },
  { id: 'camera', name: 'Mirrorless Camera', price: 24999, emoji: '\u{1F4F8}', category: 'Cameras', blurb: '24MP, 4K video' },
  { id: 'backpack', name: 'Travel Backpack', price: 1499, emoji: '\u{1F392}', category: 'Fashion', blurb: '30L, water resistant' },
  { id: 'shoes', name: 'Running Shoes', price: 2499, emoji: '\u{1F45F}', category: 'Fashion', blurb: 'Lightweight, cushioned sole' },
  { id: 'sunglasses', name: 'Polarized Sunglasses', price: 999, emoji: '\u{1F576}\uFE0F', category: 'Fashion', blurb: 'UV400 protection' },
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
