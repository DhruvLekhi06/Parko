import { app, ready, SERVERLESS } from './app.js';
import { close } from './db.js';
import { startSimulation } from './sim.js';
import { SIM_ON } from './util.js';

const PORT = process.env.PORT || 3001;

await ready();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`SpotOn API listening on http://localhost:${PORT}${SIM_ON ? ', simulation on' : ''}${SERVERLESS ? ', serverless mode (polling, no timers)' : ''}`);
  if (!SERVERLESS) startSimulation();
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
