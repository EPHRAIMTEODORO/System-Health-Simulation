import { Router, Request, Response } from 'express';
import { ServiceRegistry } from '../core/serviceRegistry';
import { LogManager } from '../core/logManager';

export function createLogRouter(registry: ServiceRegistry, logManager: LogManager): Router {
  const router = Router();

  router.get('/:serviceName', (req: Request, res: Response) => {
    const { serviceName } = req.params;

    if (!registry.has(serviceName)) {
      return res.status(404).json({ error: `Service '${serviceName}' not found` });
    }

    const level = req.query.level as string | undefined;
    const limitRaw = req.query.limit as string | undefined;
    const limit = limitRaw !== undefined ? parseInt(limitRaw, 10) : undefined;

    const logs = logManager.getLogs(serviceName, level, limit);
    return res.json(logs);
  });

  return router;
}
