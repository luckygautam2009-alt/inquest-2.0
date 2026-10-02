const shop = require('../services/shopService');
const ID_RE = /^[A-Za-z0-9_-]{1,50}$/;

function products(req, res) {
  res.status(200).json({ success: true, data: shop.CATALOG });
}

function createOrder(req, res) {
  const { customerId, productId, quantity, paymentMode } = req.body || {};
  if (!ID_RE.test(String(customerId || ''))) return res.status(400).json({ success: false, error: 'valid customerId is required' });
  const out = shop.placeOrder({ customerId, productId, quantity, paymentMode: paymentMode || 'normal' });
  if (out.status >= 400) return res.status(out.status).json({ success: false, error: out.error });
  res.status(201).json({ success: true, data: { order: out.order, payments: out.payments } });
}

function orders(req, res) {
  if (!ID_RE.test(req.params.customerId)) return res.status(400).json({ success: false, error: 'invalid customerId' });
  res.status(200).json({ success: true, data: shop.listOrders(req.params.customerId) });
}

function simulate(req, res) {
  const { customerId, action } = req.body || {};
  if (!ID_RE.test(String(customerId || '')) || !ID_RE.test(req.params.orderId)) return res.status(400).json({ success: false, error: 'invalid ids' });
  const out = shop.simulate({ orderId: req.params.orderId, customerId, action });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: out.order });
}

module.exports = { products, createOrder, orders, simulate };
