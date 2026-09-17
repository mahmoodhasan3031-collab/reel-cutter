const express = require('express');
const webhookRoutes = require('./routes/webhook');
const licenseRoutes = require('./routes/license');
const config = require('./config');

const app = express();

// Trust proxy for accurate req.ip behind reverse proxies
app.set('trust proxy', 1);

// CORS configuration — explicit origins only
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '1; mode=block');
  next();
});

// Mount webhook routes (handles its own raw parsing for signatures)
app.use('/webhook', webhookRoutes);

// JSON parser for standard API routes
app.use(express.json({ limit: '10kb' }));

// License API routes
app.use('/api/license', licenseRoutes);

// Root status
app.get('/', (req, res) => {
  res.json({
    name: 'Reel Cutter Payment Backend',
    status: 'running',
    providers: ['stripe'],
    api: '/api/license',
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.',
    },
  });
});

// Global error handler — never expose stack traces
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
});

let serverInstance = null;

function startServer(port = config.port) {
  return new Promise((resolve) => {
    serverInstance = app.listen(port, () => {
      console.log(`[PaymentServer] Listening on http://localhost:${port}`);
      resolve(serverInstance);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => resolve());
    } else {
      resolve();
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  stopServer,
};
