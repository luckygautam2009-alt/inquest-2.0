const authService = require('../services/authService');

const TOKEN_RE = /^Bearer\s+([a-f0-9]{64})$/i;
const authRequired = () => process.env.REQUIRE_AUTH === 'true';

// Optional login: if a token is sent it must be valid; if none is sent the request stays anonymous
function attachCustomer(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return next();
  const m = TOKEN_RE.exec(header);
  const customer = m ? authService.customerFromToken(m[1].toLowerCase()) : null;
  if (!customer) return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
  req.customer = customer;
  req.sessionToken = m[1].toLowerCase();
  next();
}

function enforceAuth(req, res, next) {
  if (authRequired() && !req.customer) {
    return res.status(401).json({ success: false, error: 'Please sign in to continue.' });
  }
  next();
}

// A signed-in customer can only act as themselves: the id comes from the token, never from the body
function bindCustomer(req, res, next) {
  if (req.customer) {
    if (!req.body) req.body = {};
    req.body.customerId = req.customer.id;
  }
  next();
}

function ownCustomerParam(req, res, next) {
  if (req.customer && req.params.customerId !== req.customer.id) {
    return res.status(403).json({ success: false, error: 'You can only view your own data.' });
  }
  next();
}

// Open customer listing/creation is a demo convenience; with REQUIRE_AUTH=true it is switched off
function denyWhenAuthRequired(req, res, next) {
  if (authRequired()) {
    return res.status(403).json({ success: false, error: 'Disabled: use /api/auth to create an account.' });
  }
  next();
}

module.exports = { attachCustomer, enforceAuth, bindCustomer, ownCustomerParam, denyWhenAuthRequired };
