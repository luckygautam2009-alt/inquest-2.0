const express = require('express');
const router = express.Router();
const { products, createOrder, orders, simulate } = require('../controllers/shop.controller');

router.get('/products', products);
router.post('/orders', createOrder);
router.get('/orders/:customerId', orders);
router.post('/orders/:orderId/simulate', simulate);

module.exports = router;
