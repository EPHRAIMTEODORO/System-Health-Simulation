import { Service, ServiceStatus, ServiceType } from '../types';
import { ServiceRegistry } from './serviceRegistry';
import { LogManager } from './logManager';
import logger from './logger';

export class HealthEngine {
  constructor(
    private readonly registry: ServiceRegistry,
    private readonly logManager: LogManager,
  ) {}

  /**
   * Derives a webapp's health from its current dependencies in the registry.
   * Unhealthy > Degraded > Healthy (worst dependency wins).
   */
  computeWebAppHealth(service: Service): ServiceStatus {
    if (service.dependencies.length === 0) return ServiceStatus.Healthy;

    let worst: ServiceStatus = ServiceStatus.Healthy;

    for (const depName of service.dependencies) {
      const dep = this.registry.get(depName);
      if (!dep) continue;
      if (dep.status === ServiceStatus.Unhealthy) return ServiceStatus.Unhealthy;
      if (dep.status === ServiceStatus.Degraded) worst = ServiceStatus.Degraded;
    }

    return worst;
  }

  /**
   * Recomputes and applies the health of a single webapp based on its dependencies.
   * Skips infrastructure services silently.
   */
  applyDependencyRules(serviceName: string): void {
    const service = this.registry.get(serviceName);
    if (!service || service.type !== ServiceType.WebApp) return;

    const newStatus = this.computeWebAppHealth(service);
    if (newStatus === service.status) return;

    this.applyWebAppTransition(service, newStatus);
  }

  /**
   * Recomputes health for all webapp services in the registry.
   */
  recomputeAllWebApps(): void {
    for (const service of this.registry.getAll()) {
      if (service.type === ServiceType.WebApp) {
        this.applyDependencyRules(service.name);
      }
    }
  }

  /**
   * Updates an infrastructure service's status, handling errorCount, description and logging.
   * No-ops when the status is unchanged.
   */
  updateInfrastructureService(name: string, newStatus: ServiceStatus): void {
    const service = this.registry.get(name);
    if (!service || service.status === newStatus) return;

    const updates: Partial<Service> = {
      status: newStatus,
      lastChecked: new Date().toISOString(),
    };

    if (newStatus === ServiceStatus.Unhealthy) {
      updates.errorCount = service.errorCount + 1;
      updates.description = `Service ${name} is unhealthy`;
      this.logManager.addLog(name, 'ERROR', `Infrastructure ${name} transitioned to Unhealthy`);
      logger.error({ service: name, from: service.status, to: newStatus }, `[infra] ${name}: ${service.status} → ${newStatus}`);
    } else if (newStatus === ServiceStatus.Degraded) {
      updates.errorCount = service.errorCount + 1;
      updates.description = `Service ${name} is degraded`;
      this.logManager.addLog(name, 'WARN', `Infrastructure ${name} transitioned to Degraded`);
      logger.warn({ service: name, from: service.status, to: newStatus }, `[infra] ${name}: ${service.status} → ${newStatus}`);
    } else {
      updates.errorCount = 0;
      updates.description = '';
      this.logManager.addLog(name, 'INFO', `Infrastructure ${name} recovered to Healthy`);
      logger.info({ service: name, from: service.status, to: newStatus }, `[infra] ${name}: ${service.status} → ${newStatus}`);
    }

    this.registry.update(name, updates);
  }

  /**
   * Forcefully sets any service to a given status (used by the simulate endpoint).
   * For infrastructure services, dependent webapps are recomputed afterwards.
   */
  forceSetStatus(name: string, newStatus: ServiceStatus): void {
    const service = this.registry.get(name);
    if (!service) return;

    if (service.type === ServiceType.Infrastructure) {
      this.updateInfrastructureService(name, newStatus);
      this.recomputeAllWebApps();
    } else {
      // Direct webapp override — bypass dependency rules
      if (service.status === newStatus) return;
      this.applyWebAppTransition(service, newStatus);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private applyWebAppTransition(service: Service, newStatus: ServiceStatus): void {
    const updates: Partial<Service> = {
      status: newStatus,
      lastChecked: new Date().toISOString(),
    };

    if (newStatus === ServiceStatus.Unhealthy) {
      updates.errorCount = service.errorCount + 1;
      updates.description = this.buildFailureDescription(service, newStatus);
      this.logManager.addLog(
        service.name,
        'ERROR',
        `Service ${service.name} transitioned to Unhealthy`,
      );
      logger.error({ service: service.name, from: service.status, to: newStatus }, `[webapp] ${service.name}: ${service.status} → ${newStatus}`);
    } else if (newStatus === ServiceStatus.Degraded) {
      updates.errorCount = service.errorCount + 1;
      updates.description = this.buildFailureDescription(service, newStatus);
      this.logManager.addLog(
        service.name,
        'WARN',
        `Service ${service.name} transitioned to Degraded`,
      );
      logger.warn({ service: service.name, from: service.status, to: newStatus }, `[webapp] ${service.name}: ${service.status} → ${newStatus}`);
    } else {
      updates.errorCount = 0;
      updates.description = '';
      this.logManager.addLog(service.name, 'INFO', `Service ${service.name} recovered to Healthy`);
      logger.info({ service: service.name, from: service.status, to: newStatus }, `[webapp] ${service.name}: ${service.status} → ${newStatus}`);
    }

    this.registry.update(service.name, updates);
  }

  private buildFailureDescription(service: Service, newStatus: ServiceStatus): string {
    const failingDep = service.dependencies.find((depName) => {
      const dep = this.registry.get(depName);
      return dep && dep.status !== ServiceStatus.Healthy;
    });
    return failingDep
      ? `Dependency ${failingDep} is ${newStatus}`
      : `Service ${service.name} is ${newStatus}`;
  }
}
