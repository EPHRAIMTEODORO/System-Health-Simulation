import { Router, Request, Response } from 'express';
import { ServiceRegistry } from '../core/serviceRegistry';
import { HealthEngine } from '../core/healthEngine';
import { ServiceStatus } from '../types';

const VALID_STATUSES: string[] = Object.values(ServiceStatus);

export function createSimulateRouter(
  registry: ServiceRegistry,
  healthEngine: HealthEngine,
): Router {
  const router = Router();

  router.post('/:serviceName', (req: Request, res: Response) => {
    const { serviceName } = req.params;
    const { status } = req.body as { status?: string };

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid or missing 'status'. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (!registry.has(serviceName)) {
      return res.status(404).json({ error: `Service '${serviceName}' not found` });
    }

    healthEngine.forceSetStatus(serviceName, status as ServiceStatus);

    const updated = registry.get(serviceName)!;
    return res.json(updated);
  });

  return router;
}
