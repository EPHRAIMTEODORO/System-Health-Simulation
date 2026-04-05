import express, { Application } from 'express';
import cors from 'cors';
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
  allowedOrigin?: string,
): Application {
  const app = express();

  // Trust Cloudflare / reverse-proxy headers (X-Forwarded-For, X-Forwarded-Proto)
  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: allowedOrigin ?? '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(express.json());

  app.use('/health', createHealthRouter(registry));
  app.use('/logs', createLogRouter(registry, logManager));
  app.use('/simulate', createSimulateRouter(registry, healthEngine));

  return app;
}
