import { ServiceRegistry } from './core/serviceRegistry';
import { LogManager } from './core/logManager';
import { HealthEngine } from './core/healthEngine';
import { Scheduler } from './core/scheduler';
import { seedServices } from './core/seed';
import { createApp } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const TICK_INTERVAL_MS = 5000;

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
const app = createApp(registry, logManager, healthEngine);

// Start simulation loop
scheduler.start(TICK_INTERVAL_MS);

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`[server] System Health Simulation running on http://localhost:${PORT}`);
  console.log(`[server] Scheduler ticking every ${TICK_INTERVAL_MS / 1000}s`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down gracefully');
  scheduler.stop();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received — shutting down gracefully');
  scheduler.stop();
  server.close(() => process.exit(0));
});
