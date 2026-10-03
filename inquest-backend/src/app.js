const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health.routes');
const contextRoutes = require('./routes/context.routes');
const complaintRoutes = require('./routes/complaint.routes');
const verificationRoutes = require('./routes/verification.routes');
const adminRoutes = require('./routes/admin.routes');
const shopRoutes = require('./routes/shop.routes');

const app = express();
app.set('trust proxy', 1); // behind Render/Railway/Fly: use the real client IP for rate limiting

app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, tests) or local dev origins
    if (!origin || config.corsOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, false); // browser blocks it; no server error noise
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use('/api', apiLimiter);

app.use('/api/health', healthRoutes);
app.use('/api/customers', contextRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/verify', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shop', shopRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`🚀 INQUEST backend running on port ${config.port} [${config.nodeEnv}]`);
});

module.exports = { app, server };
