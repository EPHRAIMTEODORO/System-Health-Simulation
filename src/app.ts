import express, { Application } from 'express';
import { ServiceRegistry } from './core/serviceRegistry';
import { LogManager } from './core/logManager';
import { HealthEngine } from './core/healthEngine';
import { createHealthRouter } from './routes/healthRoutes';
import { createLogRouter } from './routes/logRoutes';
import { createSimulateRouter } from './routes/simulateRoutes';

export function createApp(
  registry: ServiceRegistry,
  logManager: LogManager,
  healthEngine: HealthEngine,
): Application {
  const app = express();

  app.use(express.json());

  app.use('/health', createHealthRouter(registry));
  app.use('/logs', createLogRouter(registry, logManager));
  app.use('/simulate', createSimulateRouter(registry, healthEngine));

  return app;
}
