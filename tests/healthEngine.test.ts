import { ServiceRegistry } from '../src/core/serviceRegistry';
import { LogManager } from '../src/core/logManager';
import { HealthEngine } from '../src/core/healthEngine';
import { Service, ServiceStatus, ServiceType } from '../src/types';

const makeService = (overrides: Partial<Service> = {}): Service => ({
  name: 'Service',
  type: ServiceType.Infrastructure,
  status: ServiceStatus.Healthy,
  dependencies: [],
  lastChecked: '2020-01-01T00:00:00.000Z',
  errorCount: 0,
  description: '',
  ...overrides,
});

describe('HealthEngine', () => {
  let registry: ServiceRegistry;
  let logManager: LogManager;
  let engine: HealthEngine;

  beforeEach(() => {
    registry = new ServiceRegistry();
    logManager = new LogManager();
    engine = new HealthEngine(registry, logManager);

    registry.register(makeService({ name: 'MySQL', type: ServiceType.Infrastructure }));
    registry.register(makeService({ name: 'Email', type: ServiceType.Infrastructure }));
    registry.register(
      makeService({
        name: 'WebApp1',
        type: ServiceType.WebApp,
        dependencies: ['MySQL', 'Email'],
      }),
    );
  });

  // ─── computeWebAppHealth ─────────────────────────────────────────────────────

  describe('computeWebAppHealth', () => {
    it('should return Healthy when all dependencies are Healthy', () => {
      const webapp = registry.get('WebApp1')!;
      expect(engine.computeWebAppHealth(webapp)).toBe(ServiceStatus.Healthy);
    });

    it('should return Unhealthy when any dependency is Unhealthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      const webapp = registry.get('WebApp1')!;
      expect(engine.computeWebAppHealth(webapp)).toBe(ServiceStatus.Unhealthy);
    });

    it('should return Degraded when a dependency is Degraded and none are Unhealthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Degraded });
      const webapp = registry.get('WebApp1')!;
      expect(engine.computeWebAppHealth(webapp)).toBe(ServiceStatus.Degraded);
    });

    it('should return Unhealthy when one dep is Unhealthy and another is Degraded', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      registry.update('Email', { status: ServiceStatus.Degraded });
      const webapp = registry.get('WebApp1')!;
      expect(engine.computeWebAppHealth(webapp)).toBe(ServiceStatus.Unhealthy);
    });

    it('should return Healthy when there are no dependencies', () => {
      const noDeps = makeService({ name: 'Standalone', type: ServiceType.WebApp, dependencies: [] });
      expect(engine.computeWebAppHealth(noDeps)).toBe(ServiceStatus.Healthy);
    });
  });

  // ─── applyDependencyRules ────────────────────────────────────────────────────

  describe('applyDependencyRules', () => {
    it('should update webapp status to Unhealthy when dependency is Unhealthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Unhealthy);
    });

    it('should update webapp status to Degraded when dependency is Degraded', () => {
      registry.update('MySQL', { status: ServiceStatus.Degraded });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Degraded);
    });

    it('should not change webapp status if all dependencies are Healthy', () => {
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Healthy);
    });

    it('should increment errorCount on transition to Unhealthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.errorCount).toBe(1);
    });

    it('should increment errorCount on transition to Degraded', () => {
      registry.update('MySQL', { status: ServiceStatus.Degraded });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.errorCount).toBe(1);
    });

    it('should reset errorCount on recovery to Healthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.errorCount).toBe(1);

      registry.update('MySQL', { status: ServiceStatus.Healthy });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Healthy);
      expect(registry.get('WebApp1')?.errorCount).toBe(0);
    });

    it('should not increment errorCount if status has not changed', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1'); // first transition, count = 1
      engine.applyDependencyRules('WebApp1'); // same status, no change, count stays 1
      expect(registry.get('WebApp1')?.errorCount).toBe(1);
    });

    it('should generate an ERROR log on transition to Unhealthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      const logs = logManager.getLogs('WebApp1');
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('ERROR');
    });

    it('should generate a WARN log on transition to Degraded', () => {
      registry.update('MySQL', { status: ServiceStatus.Degraded });
      engine.applyDependencyRules('WebApp1');
      const logs = logManager.getLogs('WebApp1');
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('WARN');
    });

    it('should generate an INFO log on recovery to Healthy', () => {
      registry.update('WebApp1', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      const logs = logManager.getLogs('WebApp1');
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('INFO');
    });

    it('should be a no-op for infrastructure services', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      const before = registry.get('MySQL')!.errorCount;
      engine.applyDependencyRules('MySQL');
      expect(registry.get('MySQL')?.errorCount).toBe(before);
      expect(logManager.getLogs('MySQL').length).toBe(0);
    });

    it('should update lastChecked on status transition', () => {
      const before = registry.get('WebApp1')!.lastChecked;
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      const after = registry.get('WebApp1')!.lastChecked;
      expect(after).not.toBe(before);
    });

    it('should set a description mentioning the failing dependency', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy });
      engine.applyDependencyRules('WebApp1');
      expect(registry.get('WebApp1')?.description).toContain('MySQL');
    });
  });

  // ─── updateInfrastructureService ────────────────────────────────────────────

  describe('updateInfrastructureService', () => {
    it('should update infrastructure service status', () => {
      engine.updateInfrastructureService('MySQL', ServiceStatus.Unhealthy);
      expect(registry.get('MySQL')?.status).toBe(ServiceStatus.Unhealthy);
    });

    it('should increment errorCount on transition to failure', () => {
      engine.updateInfrastructureService('MySQL', ServiceStatus.Unhealthy);
      expect(registry.get('MySQL')?.errorCount).toBe(1);
    });

    it('should reset errorCount on recovery to Healthy', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy, errorCount: 3 });
      engine.updateInfrastructureService('MySQL', ServiceStatus.Healthy);
      expect(registry.get('MySQL')?.errorCount).toBe(0);
    });

    it('should generate an ERROR log on transition to Unhealthy', () => {
      engine.updateInfrastructureService('MySQL', ServiceStatus.Unhealthy);
      const logs = logManager.getLogs('MySQL');
      expect(logs.some((l) => l.level === 'ERROR')).toBe(true);
    });

    it('should generate a WARN log on transition to Degraded', () => {
      engine.updateInfrastructureService('MySQL', ServiceStatus.Degraded);
      const logs = logManager.getLogs('MySQL');
      expect(logs.some((l) => l.level === 'WARN')).toBe(true);
    });

    it('should generate an INFO log on recovery', () => {
      registry.update('MySQL', { status: ServiceStatus.Unhealthy, errorCount: 1 });
      engine.updateInfrastructureService('MySQL', ServiceStatus.Healthy);
      const logs = logManager.getLogs('MySQL');
      expect(logs.some((l) => l.level === 'INFO')).toBe(true);
    });

    it('should not generate a log if status is identical', () => {
      engine.updateInfrastructureService('MySQL', ServiceStatus.Healthy);
      expect(logManager.getLogs('MySQL').length).toBe(0);
    });
  });

  // ─── recomputeAllWebApps ─────────────────────────────────────────────────────

  describe('recomputeAllWebApps', () => {
    it('should update all webapp services based on current dependency state', () => {
      registry.register(makeService({ name: 'PostgreSQL', type: ServiceType.Infrastructure }));
      registry.register(
        makeService({
          name: 'WebApp2',
          type: ServiceType.WebApp,
          dependencies: ['PostgreSQL'],
        }),
      );

      registry.update('PostgreSQL', { status: ServiceStatus.Unhealthy });
      engine.recomputeAllWebApps();

      expect(registry.get('WebApp1')?.status).toBe(ServiceStatus.Healthy);
      expect(registry.get('WebApp2')?.status).toBe(ServiceStatus.Unhealthy);
    });
  });
});
