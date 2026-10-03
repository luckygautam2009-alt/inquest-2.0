const express = require('express');
const router = express.Router();
const { products, createOrder, orders, simulate } = require('../controllers/shop.controller');
const { attachCustomer, enforceAuth, bindCustomer, ownCustomerParam } = require('../middleware/customerAuth');

router.get('/products', products);
router.post('/orders', attachCustomer, enforceAuth, bindCustomer, createOrder);
router.get('/orders/:customerId', attachCustomer, enforceAuth, ownCustomerParam, orders);
router.post('/orders/:orderId/simulate', attachCustomer, enforceAuth, bindCustomer, simulate);

module.exports = router;
