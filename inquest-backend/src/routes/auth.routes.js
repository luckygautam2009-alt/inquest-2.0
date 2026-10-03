const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { signup, login, me, logout } = require('../controllers/auth.controller');
const { attachCustomer } = require('../middleware/customerAuth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 40,
  message: { success: false, error: 'Too many sign-in attempts. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function needSession(req, res, next) {
  if (!req.customer) return res.status(401).json({ success: false, error: 'Not signed in' });
  next();
}

router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, login);
router.get('/me', attachCustomer, needSession, me);
router.post('/logout', attachCustomer, needSession, logout);

module.exports = router;
