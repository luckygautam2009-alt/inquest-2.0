const express = require('express');
const router = express.Router();
const { getCustomerContext } = require('../controllers/context.controller');
const { listCustomers, createCustomer } = require('../controllers/customer.controller');
const { customerIdParamRules } = require('../middleware/validators/customerValidator');
const { newCustomerValidationRules } = require('../middleware/validators/newCustomerValidator');
const { validate } = require('../middleware/validate');
const { attachCustomer, enforceAuth, ownCustomerParam, denyWhenAuthRequired } = require('../middleware/customerAuth');

router.get('/', denyWhenAuthRequired, listCustomers);
router.post('/', denyWhenAuthRequired, newCustomerValidationRules, validate, createCustomer);
router.get('/:customerId/context', attachCustomer, enforceAuth, ownCustomerParam, customerIdParamRules, validate, getCustomerContext);

module.exports = router;
