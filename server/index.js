const express = require('express');
const webhookRoutes = require('./routes/webhook');
const config = require('./config');

const app = express();

// Mount webhook routes (handles its own raw parsing for signatures)
app.use('/webhook', webhookRoutes);

// JSON parser for other standard API routes
app.use(express.json());

// Root status
app.get('/', (req, res) => {
  res.json({
    name: 'Reel Cutter Payment Backend',
    status: 'running',
    providers: ['stripe'],
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
