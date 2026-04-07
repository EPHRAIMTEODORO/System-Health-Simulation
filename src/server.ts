import { ServiceRegistry } from './core/serviceRegistry';
import { LogManager } from './core/logManager';
import { HealthEngine } from './core/healthEngine';
import { Scheduler } from './core/scheduler';
import { seedServices } from './core/seed';
import { createApp } from './app';
import logger from './core/logger';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const TICK_INTERVAL_MS = 5000;
// Set ALLOWED_ORIGIN to your Netlify URL, e.g. https://your-app.netlify.app
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

// ── Bootstrap ────────────────────────────────────────────────────────────────

const registry = new ServiceRegistry();
const logManager = new LogManager(200);
const healthEngine = new HealthEngine(registry, logManager);
const scheduler = new Scheduler(registry, healthEngine, logManager, 'random');

// Seed initial state
for (const service of seedServices) {
  registry.register(service);
}

// Wire up Express app
const app = createApp(registry, logManager, healthEngine, ALLOWED_ORIGIN);

// Start simulation loop
scheduler.start(TICK_INTERVAL_MS);

// Start HTTP server — bind to 0.0.0.0 so other devices on the network can reach it
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, interval: `${TICK_INTERVAL_MS / 1000}s` }, `System Health Simulation running on http://0.0.0.0:${PORT}`);
  logger.info(`Scheduler ticking every ${TICK_INTERVAL_MS / 1000}s`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  scheduler.stop();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  scheduler.stop();
  server.close(() => process.exit(0));
});
