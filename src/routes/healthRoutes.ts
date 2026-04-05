import { Router, Request, Response } from 'express';
import { ServiceRegistry } from '../core/serviceRegistry';
import { Service } from '../types';

function enrichService(service: Service, registry: ServiceRegistry) {
  const dependencies: Record<string, { status: string }> = {};
  for (const depName of service.dependencies) {
    const dep = registry.get(depName);
    if (dep) {
      dependencies[depName] = { status: dep.status };
    }
  }
  return {
    name: service.name,
    type: service.type,
    status: service.status,
    lastChecked: service.lastChecked,
    errorCount: service.errorCount,
    description: service.description,
    dependencies,
  };
}

export function createHealthRouter(registry: ServiceRegistry): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const services = registry.getAll().map((s) => enrichService(s, registry));
    res.json(services);
  });

  router.get('/:serviceName', (req: Request, res: Response) => {
    const { serviceName } = req.params;
    const service = registry.get(serviceName);
    if (!service) {
      return res.status(404).json({ error: `Service '${serviceName}' not found` });
    }
    return res.json(enrichService(service, registry));
  });

  return router;
}
