const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 400,
  message: { success: false, error: 'Too many requests, slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter };
